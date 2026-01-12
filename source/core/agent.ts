import { useState, useCallback, useRef, useEffect } from 'react';
import { streamResponse, generateStructuredOutput, calculateCost, type CoreMessage, type CoreTool, type ReasoningConfig, type TokenUsage, type CostTracking } from './llm.js';
import { getAgentConfig } from './config.js';
import { createSubAgentTool, type SubAgentConfig } from './sub-agent.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

/**
 * Inline agent definition (Claude SDK-style)
 * Used for declaratively defining sub-agents within the main agent config
 */
export interface AgentDefinition {
	/** Description shown to LLM when deciding to delegate to this agent */
	description: string;
	/** System prompt for the sub-agent */
	prompt: string;
	/** Tools available to the sub-agent (tool names or tool definitions) */
	tools?: string[] | Array<{ name: string; tool: CoreTool }>;
	/** Model override for this agent ('sonnet' | 'opus' | 'haiku' | full model string) */
	model?: string;
	/** Maximum steps for this agent (default: 10) */
	maxSteps?: number;
}

/**
 * Hook callback for intercepting tool calls
 */
export interface ToolHookContext {
	toolCallId: string;
	agentName: string;
	messages: CoreMessage[];
}

export type BeforeToolHook = (
	toolName: string,
	input: Record<string, unknown>,
	context: ToolHookContext
) => Promise<{
	/** 'allow' to proceed, 'deny' to block, 'modify' to change input */
	action: 'allow' | 'deny' | 'modify';
	/** Modified input (only used if action is 'modify') */
	modifiedInput?: Record<string, unknown>;
	/** Reason for denying (shown to LLM) */
	denyReason?: string;
}>;

export type AfterToolHook = (
	toolName: string,
	input: Record<string, unknown>,
	result: unknown,
	context: ToolHookContext & { duration: number }
) => Promise<{
	/** Optional modified result */
	modifiedResult?: unknown;
}>;

export interface AgentHooks {
	/** Called before each tool execution */
	onBeforeToolCall?: BeforeToolHook;
	/** Called after each tool execution */
	onAfterToolCall?: AfterToolHook;
	/** Called when agent starts processing a message */
	onStart?: (message: string) => Promise<void>;
	/** Called when agent finishes processing */
	onFinish?: (response: string, stats: AgentStats) => Promise<void>;
}

export interface AgentStats {
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
	costUSD: number;
	toolCallCount: number;
	duration: number;
	modelUsage: Record<string, CostTracking>;
}

export interface AgentConfig {
	name: string;
	systemPrompt: string;
	tools?: Record<string, CoreTool>;
	maxIterations?: number;
	model?: string;
	reasoning?: ReasoningConfig;
	/** Inline agent definitions (Claude SDK-style) */
	agents?: Record<string, AgentDefinition>;
	/** Hook callbacks for intercepting tool calls */
	hooks?: AgentHooks;
	/** Output schema for structured responses */
	outputSchema?: z.ZodType;
}

export interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
}

export interface ToolCallEvent {
	id: string;
	toolCallId: string;
	name: string;
	args: unknown;
	status: 'pending' | 'running' | 'complete' | 'error' | 'denied';
	result?: unknown;
	error?: string;
	startTime: number;
	endTime?: number;
}

export interface AgentState {
	messages: Message[];
	isLoading: boolean;
	currentToolCalls: ToolCallEvent[];
	error?: Error;
	streamingContent: string;
}

export type AgentEventType =
	| 'text-delta'
	| 'tool-call-start'
	| 'tool-call-complete'
	| 'tool-call-error'
	| 'tool-call-denied'
	| 'step-finish'
	| 'finish'
	| 'error';

export interface AgentEvent {
	type: AgentEventType;
	content?: string;
	toolCall?: ToolCallEvent;
	error?: Error;
	stats?: AgentStats;
}

export type AgentEventHandler = (event: AgentEvent) => void;

// ============================================================================
// Session Management
// ============================================================================

export interface AgentSession {
	id: string;
	agentName: string;
	createdAt: number;
	updatedAt: number;
	messages: CoreMessage[];
	stats: AgentStats;
}

let sessionIdCounter = 0;
function generateSessionId(): string {
	return `session_${Date.now()}_${++sessionIdCounter}`;
}

let messageIdCounter = 0;
function generateMessageId(): string {
	return `msg_${Date.now()}_${++messageIdCounter}`;
}

// ============================================================================
// Model Alias Resolution
// ============================================================================

const MODEL_ALIASES: Record<string, string> = {
	'opus': 'anthropic:claude-opus-4-5-20250514',
	'sonnet': 'anthropic:claude-sonnet-4-20250514',
	'haiku': 'anthropic:claude-haiku-3-5-20241022',
};

function resolveModelAlias(model: string): string {
	return MODEL_ALIASES[model] ?? model;
}

// ============================================================================
// Agent Factory
// ============================================================================

/**
 * Creates a reusable agent instance with conversation history, tool support,
 * inline sub-agents, hooks, session management, and cost tracking.
 */
export function createAgent(config: AgentConfig) {
	const {
		name,
		systemPrompt,
		tools: configTools = {},
		maxIterations: configMaxIterations,
		model: configModel,
		reasoning,
		agents: inlineAgents = {},
		hooks = {},
		outputSchema,
	} = config;

	// Merge with agent-specific config from file
	const agentConfig = getAgentConfig(name);
	const maxIterations = configMaxIterations ?? agentConfig.maxIterations;
	const model = configModel ?? agentConfig.model;

	// Build tools record including inline agents as sub-agent tools
	let allTools: Record<string, CoreTool> = { ...configTools };

	// Convert inline agent definitions to sub-agent tools
	for (const [agentName, agentDef] of Object.entries(inlineAgents)) {
		const resolvedModel = resolveModelAlias(agentDef.model ?? 'sonnet');

		// Resolve tool references
		let agentTools: Array<{ name: string; tool: CoreTool }> | Record<string, CoreTool>;
		if (Array.isArray(agentDef.tools)) {
			if (typeof agentDef.tools[0] === 'string') {
				// Tool names - filter from parent tools
				const toolNames = agentDef.tools as string[];
				agentTools = {};
				for (const toolName of toolNames) {
					if (configTools[toolName]) {
						agentTools[toolName] = configTools[toolName]!;
					}
				}
			} else {
				// Tool definitions
				agentTools = agentDef.tools as Array<{ name: string; tool: CoreTool }>;
			}
		} else {
			// Inherit all parent tools if not specified
			agentTools = configTools;
		}

		const subAgentConfig: SubAgentConfig = {
			name: agentName.replace(/-/g, '_'), // Convert kebab-case to snake_case
			description: agentDef.description,
			systemPrompt: agentDef.prompt,
			model: resolvedModel,
			tools: agentTools,
			maxSteps: agentDef.maxSteps ?? 10,
		};

		const subAgentTool = createSubAgentTool(subAgentConfig);
		allTools[subAgentTool.name] = subAgentTool.tool;
	}

	// Session state
	let conversationHistory: CoreMessage[] = [];
	let abortController: AbortController | null = null;
	let currentSessionId: string = generateSessionId();
	let cumulativeStats: AgentStats = {
		totalTokens: 0,
		promptTokens: 0,
		completionTokens: 0,
		costUSD: 0,
		toolCallCount: 0,
		duration: 0,
		modelUsage: {},
	};

	/**
	 * Wraps tools with session context and hook support
	 * Always wraps to inject sessionId, adds hook support if hooks are defined
	 */
	function wrapToolsWithSession(
		tools: Record<string, CoreTool>,
		hookContext: Omit<ToolHookContext, 'toolCallId'>
	): Record<string, CoreTool> {
		const wrappedTools: Record<string, CoreTool> = {};

		for (const [toolName, tool] of Object.entries(tools)) {
			// Create a wrapped version of the tool
			const wrappedTool: CoreTool = {
				...tool,
				execute: async (params: Record<string, unknown>, context: { toolCallId: string; messages: unknown[]; abortSignal?: AbortSignal }) => {
					const fullContext: ToolHookContext = {
						...hookContext,
						toolCallId: context.toolCallId,
					};

					// Before hook
					if (hooks.onBeforeToolCall) {
						const beforeResult = await hooks.onBeforeToolCall(toolName, params, fullContext);

						if (beforeResult.action === 'deny') {
							return {
								success: false,
								denied: true,
								reason: beforeResult.denyReason ?? 'Tool call denied by hook',
							};
						}

						if (beforeResult.action === 'modify' && beforeResult.modifiedInput) {
							params = beforeResult.modifiedInput;
						}
					}

					// Execute original tool with sessionId injected into context
					const startTime = Date.now();
					const contextWithSession = {
						...context,
						sessionId: currentSessionId,
					};
					const result = await (tool.execute as (params: Record<string, unknown>, context: { toolCallId: string; messages: unknown[]; abortSignal?: AbortSignal; sessionId?: string }) => Promise<unknown>)(params, contextWithSession);
					const duration = Date.now() - startTime;

					// After hook
					if (hooks.onAfterToolCall) {
						const afterResult = await hooks.onAfterToolCall(toolName, params, result, {
							...fullContext,
							duration,
						});

						if (afterResult.modifiedResult !== undefined) {
							return afterResult.modifiedResult;
						}
					}

					return result;
				},
			};

			wrappedTools[toolName] = wrappedTool;
		}

		return wrappedTools;
	}

	/**
	 * Updates cumulative stats with new usage data
	 */
	function updateStats(modelUsed: string, usage: TokenUsage, toolCalls: number, duration: number) {
		const cost = calculateCost(modelUsed, usage);

		cumulativeStats.totalTokens += usage.totalTokens;
		cumulativeStats.promptTokens += usage.promptTokens;
		cumulativeStats.completionTokens += usage.completionTokens;
		cumulativeStats.costUSD += cost;
		cumulativeStats.toolCallCount += toolCalls;
		cumulativeStats.duration += duration;

		// Track per-model usage
		if (!cumulativeStats.modelUsage[modelUsed]) {
			cumulativeStats.modelUsage[modelUsed] = {
				model: modelUsed,
				usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
				costUSD: 0,
			};
		}
		const modelStats = cumulativeStats.modelUsage[modelUsed]!;
		modelStats.usage.promptTokens += usage.promptTokens;
		modelStats.usage.completionTokens += usage.completionTokens;
		modelStats.usage.totalTokens += usage.totalTokens;
		modelStats.costUSD += cost;
	}

	/**
	 * Sends a message and streams the response
	 */
	async function sendMessage(
		userMessage: string,
		onEvent: AgentEventHandler
	): Promise<{ response: string; toolCalls: ToolCallEvent[]; stats: AgentStats }> {
		const startTime = Date.now();

		// Call onStart hook
		if (hooks.onStart) {
			await hooks.onStart(userMessage);
		}

		// Add user message to history
		conversationHistory.push({
			role: 'user',
			content: userMessage,
		});

		abortController = new AbortController();
		const toolCallEvents: ToolCallEvent[] = [];
		let fullResponse = '';
		let toolCallIdCounter = 0;
		let messageToolCallCount = 0;

		// Wrap tools with session context and hooks
		const wrappedTools = wrapToolsWithSession(allTools, {
			agentName: name,
			messages: conversationHistory,
		});

		try {
			const result = await streamResponse({
				model,
				system: systemPrompt,
				messages: conversationHistory,
				tools: Object.keys(wrappedTools).length > 0 ? wrappedTools : undefined,
				maxSteps: maxIterations,
				abortSignal: abortController.signal,
				reasoning,
			});

			// Use fullStream to get all events including tool calls
			for await (const event of result.fullStream) {
				switch (event.type) {
					case 'text-delta':
						fullResponse += event.text;
						onEvent({ type: 'text-delta', content: event.text });
						break;

					case 'tool-call': {
						messageToolCallCount++;
						const toolEvent: ToolCallEvent = {
							id: `tc_${Date.now()}_${++toolCallIdCounter}`,
							toolCallId: event.toolCallId,
							name: event.toolName,
							args: event.input,
							status: 'running',
							startTime: Date.now(),
						};
						toolCallEvents.push(toolEvent);
						onEvent({ type: 'tool-call-start', toolCall: toolEvent });
						break;
					}

					case 'tool-result': {
						const existingCall = toolCallEvents.find((e) => e.toolCallId === event.toolCallId);
						if (existingCall) {
							const output = event.output as Record<string, unknown> | null;
							const isDenied = output && typeof output === 'object' && 'denied' in output && output['denied'] === true;
							const isError = output && typeof output === 'object' && 'success' in output && output['success'] === false && !isDenied;

							existingCall.status = isDenied ? 'denied' : isError ? 'error' : 'complete';
							existingCall.result = event.output;
							if (isError && 'error' in output) {
								existingCall.error = String(output['error']);
							}
							if (isDenied && 'reason' in output) {
								existingCall.error = String(output['reason']);
							}
							existingCall.endTime = Date.now();
							onEvent({
								type: isDenied ? 'tool-call-denied' : isError ? 'tool-call-error' : 'tool-call-complete',
								toolCall: existingCall
							});
						}
						break;
					}

					case 'finish':
						break;

					case 'error':
						onEvent({ type: 'error', error: new Error(String(event.error)) });
						break;
				}
			}

			// Get usage from result
			const usage = await result.usage;
			const tokenUsage: TokenUsage = {
				promptTokens: usage?.inputTokens ?? 0,
				completionTokens: usage?.outputTokens ?? 0,
				totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
			};

			const duration = Date.now() - startTime;
			updateStats(model ?? 'unknown', tokenUsage, messageToolCallCount, duration);

			// Add assistant response to history
			conversationHistory.push({
				role: 'assistant',
				content: fullResponse,
			});

			// Call onFinish hook
			if (hooks.onFinish) {
				await hooks.onFinish(fullResponse, { ...cumulativeStats });
			}

			onEvent({ type: 'finish', stats: { ...cumulativeStats } });

			return {
				response: fullResponse,
				toolCalls: toolCallEvents,
				stats: { ...cumulativeStats },
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			// Abort any running sub-agents when main agent errors
			if (abortController) {
				abortController.abort();
			}
			onEvent({ type: 'error', error: err });
			throw err;
		} finally {
			abortController = null;
		}
	}

	/**
	 * Sends a message and returns a structured response matching the output schema
	 * Only available if outputSchema was provided in config
	 */
	async function sendMessageStructured<T>(
		userMessage: string,
		schema?: z.ZodType<T>
	): Promise<{ data: T; stats: AgentStats }> {
		const effectiveSchema = schema ?? outputSchema;
		if (!effectiveSchema) {
			throw new Error('No output schema provided. Either set outputSchema in config or pass a schema to sendMessageStructured.');
		}

		const startTime = Date.now();

		// Call onStart hook
		if (hooks.onStart) {
			await hooks.onStart(userMessage);
		}

		// Add user message to history
		conversationHistory.push({
			role: 'user',
			content: userMessage,
		});

		try {
			const result = await generateStructuredOutput({
				model,
				system: systemPrompt,
				messages: conversationHistory,
				schema: effectiveSchema,
			});

			const duration = Date.now() - startTime;
			updateStats(model ?? 'unknown', result.usage, 0, duration);

			// Add assistant response to history (as JSON string for context)
			conversationHistory.push({
				role: 'assistant',
				content: JSON.stringify(result.object, null, 2),
			});

			// Call onFinish hook
			if (hooks.onFinish) {
				await hooks.onFinish(JSON.stringify(result.object), { ...cumulativeStats });
			}

			return {
				data: result.object as T,
				stats: { ...cumulativeStats },
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			throw err;
		}
	}

	/**
	 * Cancels the current request
	 */
	function cancel(): void {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
	}

	/**
	 * Resets the conversation history and stats
	 */
	function reset(): void {
		conversationHistory = [];
		currentSessionId = generateSessionId();
		cumulativeStats = {
			totalTokens: 0,
			promptTokens: 0,
			completionTokens: 0,
			costUSD: 0,
			toolCallCount: 0,
			duration: 0,
			modelUsage: {},
		};
		cancel();
	}

	/**
	 * Gets the current conversation history
	 */
	function getHistory(): CoreMessage[] {
		return [...conversationHistory];
	}

	/**
	 * Gets current session stats
	 */
	function getStats(): AgentStats {
		return { ...cumulativeStats };
	}

	/**
	 * Exports the current session for later restoration
	 */
	function exportSession(): AgentSession {
		return {
			id: currentSessionId,
			agentName: name,
			createdAt: Date.now() - cumulativeStats.duration,
			updatedAt: Date.now(),
			messages: [...conversationHistory],
			stats: { ...cumulativeStats },
		};
	}

	/**
	 * Imports a previous session to resume the conversation
	 */
	function importSession(session: AgentSession): void {
		if (session.agentName !== name) {
			throw new Error(`Session agent "${session.agentName}" does not match current agent "${name}"`);
		}
		currentSessionId = session.id;
		conversationHistory = [...session.messages];
		cumulativeStats = { ...session.stats };
	}

	/**
	 * Gets the current session ID
	 */
	function getSessionId(): string {
		return currentSessionId;
	}

	return {
		name,
		model,
		reasoning: reasoning?.enabled ?? false,
		sendMessage,
		sendMessageStructured,
		cancel,
		reset,
		getHistory,
		getStats,
		exportSession,
		importSession,
		getSessionId,
	};
}

export type Agent = ReturnType<typeof createAgent>;

// ============================================================================
// React Hook
// ============================================================================

/**
 * React hook for using an agent in components
 * Manages state and provides a clean interface for the UI
 */
export function useAgent(agent: Agent) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [streamingContent, setStreamingContent] = useState('');
	const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallEvent[]>([]);
	const [error, setError] = useState<Error | undefined>();
	const [stats, setStats] = useState<AgentStats | undefined>();

	const agentRef = useRef(agent);
	agentRef.current = agent;

	const sendMessage = useCallback(async (content: string) => {
		if (!content.trim()) return;

		setIsLoading(true);
		setError(undefined);
		setStreamingContent('');
		setCurrentToolCalls([]);

		// Add user message
		const userMessage: Message = {
			id: generateMessageId(),
			role: 'user',
			content,
			timestamp: Date.now(),
		};
		setMessages((prev) => [...prev, userMessage]);

		let assistantContent = '';
		let hadToolCallSinceLastText = false;

		try {
			await agentRef.current.sendMessage(content, (event) => {
				switch (event.type) {
					case 'text-delta':
						if (hadToolCallSinceLastText && assistantContent.length > 0) {
							assistantContent += ' ';
							hadToolCallSinceLastText = false;
						}
						assistantContent += event.content ?? '';
						setStreamingContent(assistantContent);
						break;

					case 'tool-call-start':
						if (event.toolCall) {
							setCurrentToolCalls((prev) => {
								const existing = prev.find((tc) => tc.toolCallId === event.toolCall!.toolCallId);
								if (existing) {
									return prev.map((tc) =>
										tc.toolCallId === event.toolCall!.toolCallId
											? { ...tc, status: 'running' as const }
											: tc
									);
								}
								return [...prev, event.toolCall!];
							});
						}
						break;

					case 'tool-call-complete':
						if (event.toolCall) {
							setCurrentToolCalls((prev) =>
								prev.map((tc) =>
									tc.toolCallId === event.toolCall!.toolCallId
										? { ...tc, status: 'complete' as const, result: event.toolCall!.result, endTime: Date.now() }
										: tc
								)
							);
							hadToolCallSinceLastText = true;
						}
						break;

					case 'tool-call-error':
						if (event.toolCall) {
							setCurrentToolCalls((prev) =>
								prev.map((tc) =>
									tc.toolCallId === event.toolCall!.toolCallId
										? { ...tc, status: 'error' as const, error: event.toolCall!.error, endTime: Date.now() }
										: tc
								)
							);
							hadToolCallSinceLastText = true;
						}
						break;

					case 'tool-call-denied':
						if (event.toolCall) {
							setCurrentToolCalls((prev) =>
								prev.map((tc) =>
									tc.toolCallId === event.toolCall!.toolCallId
										? { ...tc, status: 'denied' as const, error: event.toolCall!.error, endTime: Date.now() }
										: tc
								)
							);
							hadToolCallSinceLastText = true;
						}
						break;

					case 'finish':
						setStreamingContent('');
						// Force any stuck 'running' tool calls to complete
						setCurrentToolCalls((prev) =>
							prev.map((tc) =>
								tc.status === 'running'
									? { ...tc, status: 'complete' as const, endTime: Date.now() }
									: tc
							)
						);
						if (assistantContent) {
							const assistantMessage: Message = {
								id: generateMessageId(),
								role: 'assistant',
								content: assistantContent,
								timestamp: Date.now(),
							};
							setMessages((prev) => [...prev, assistantMessage]);
						}
						if (event.stats) {
							setStats(event.stats);
						}
						break;

					case 'error':
						setError(event.error);
						break;
				}
			});
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setIsLoading(false);
		}
	}, []);

	const cancel = useCallback(() => {
		agentRef.current.cancel();
		setIsLoading(false);
	}, []);

	const reset = useCallback(() => {
		agentRef.current.reset();
		setMessages([]);
		setStreamingContent('');
		setCurrentToolCalls([]);
		setError(undefined);
		setStats(undefined);
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			agentRef.current.cancel();
		};
	}, []);

	return {
		messages,
		isLoading,
		streamingContent,
		currentToolCalls,
		error,
		stats,
		sendMessage,
		cancel,
		reset,
	};
}

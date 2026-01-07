import { useState, useCallback, useRef, useEffect } from 'react';
import { streamResponse, type CoreMessage, type CoreTool } from './llm.js';
import { getAgentConfig } from './config.js';

export interface AgentConfig {
	name: string;
	systemPrompt: string;
	tools?: Record<string, CoreTool>;
	maxIterations?: number;
	model?: string;
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
	status: 'pending' | 'running' | 'complete' | 'error';
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
	| 'step-finish'
	| 'finish'
	| 'error';

export interface AgentEvent {
	type: AgentEventType;
	content?: string;
	toolCall?: ToolCallEvent;
	error?: Error;
}

export type AgentEventHandler = (event: AgentEvent) => void;

let messageIdCounter = 0;
function generateMessageId(): string {
	return `msg_${Date.now()}_${++messageIdCounter}`;
}


/**
 * Creates a reusable agent instance with conversation history and tool support
 */
export function createAgent(config: AgentConfig) {
	const { name, systemPrompt, tools = {}, maxIterations: configMaxIterations, model: configModel } = config;

	// Merge with agent-specific config from file
	const agentConfig = getAgentConfig(name);
	const maxIterations = configMaxIterations ?? agentConfig.maxIterations;
	const model = configModel ?? agentConfig.model;

	let conversationHistory: CoreMessage[] = [];
	let abortController: AbortController | null = null;

	/**
	 * Sends a message and streams the response
	 * @param userMessage The user's message
	 * @param onEvent Callback for streaming events
	 */
	async function sendMessage(
		userMessage: string,
		onEvent: AgentEventHandler
	): Promise<{ response: string; toolCalls: ToolCallEvent[] }> {
		// Add user message to history
		conversationHistory.push({
			role: 'user',
			content: userMessage,
		});

		abortController = new AbortController();
		const toolCallEvents: ToolCallEvent[] = [];
		let fullResponse = '';
		let toolCallIdCounter = 0;

		try {
			const result = await streamResponse({
				model,
				system: systemPrompt,
				messages: conversationHistory,
				tools: Object.keys(tools).length > 0 ? tools : undefined,
				maxSteps: maxIterations,
				abortSignal: abortController.signal,
			});

			// Use fullStream to get all events including tool calls
			for await (const event of result.fullStream) {
				switch (event.type) {
					case 'text-delta':
						fullResponse += event.text;
						onEvent({ type: 'text-delta', content: event.text });
						break;

					case 'tool-call': {
						// Tool call is starting
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
						// Tool call completed
						const existingCall = toolCallEvents.find((e) => e.toolCallId === event.toolCallId);
						if (existingCall) {
							// Check if the tool result indicates failure
							const output = event.output as Record<string, unknown> | null;
							const isError = output && typeof output === 'object' && 'success' in output && output['success'] === false;

							existingCall.status = isError ? 'error' : 'complete';
							existingCall.result = event.output;
							if (isError && 'error' in output) {
								existingCall.error = String(output['error']);
							}
							existingCall.endTime = Date.now();
							onEvent({ type: isError ? 'tool-call-error' : 'tool-call-complete', toolCall: existingCall });
						}
						break;
					}

					case 'finish':
						// Stream finished
						break;

					case 'error':
						onEvent({ type: 'error', error: new Error(String(event.error)) });
						break;
				}
			}

			// Add assistant response to history
			conversationHistory.push({
				role: 'assistant',
				content: fullResponse,
			});

			onEvent({ type: 'finish' });

			return {
				response: fullResponse,
				toolCalls: toolCallEvents,
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			onEvent({ type: 'error', error: err });
			throw err;
		} finally {
			abortController = null;
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
	 * Resets the conversation history
	 */
	function reset(): void {
		conversationHistory = [];
		cancel();
	}

	/**
	 * Gets the current conversation history
	 */
	function getHistory(): CoreMessage[] {
		return [...conversationHistory];
	}

	return {
		name,
		sendMessage,
		cancel,
		reset,
		getHistory,
	};
}

export type Agent = ReturnType<typeof createAgent>;

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

		try {
			await agentRef.current.sendMessage(content, (event) => {
				switch (event.type) {
					case 'text-delta':
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
						}
						break;

					case 'finish':
						// Add completed assistant message
						if (assistantContent) {
							const assistantMessage: Message = {
								id: generateMessageId(),
								role: 'assistant',
								content: assistantContent,
								timestamp: Date.now(),
							};
							setMessages((prev) => [...prev, assistantMessage]);
						}
						setStreamingContent('');
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
		sendMessage,
		cancel,
		reset,
	};
}

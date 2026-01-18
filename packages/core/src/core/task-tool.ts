/**
 * Task Tool - Universal Sub-Agent Launcher
 *
 * A single tool for launching specialized sub-agents.
 * Similar to Claude Code's Task tool pattern.
 */

import { z } from 'zod';
import { generateText, stepCountIs } from 'ai';
import { defineTool, type CoreTool } from './tools.js';
import { createModel } from './llm.js';
import { agentEvents, generateProcessId } from './events.js';
import {
	AgentTypeSchema,
	type AgentType,
	getAgentTypeConfig,
	resolveAgentModel,
	filterToolsForAgentType,
	buildAgentSystemPrompt,
} from './agent-types.js';

// ============================================================================
// Types
// ============================================================================

export interface TaskResult {
	success: boolean;
	agentType: AgentType;
	processId: string;
	description: string;
	response: string;
	toolCallCount: number;
	toolCalls: ToolCallSummary[];
	duration: number;
	error?: string;
}

export interface ToolCallSummary {
	name: string;
	args: Record<string, unknown>;
	result: unknown;
	duration: number;
}

// ============================================================================
// Task Lock - Prevent Parallel Execution
// ============================================================================

let activeTaskId: string | null = null;

/**
 * Check if a task is currently running
 */
export function isTaskRunning(): boolean {
	return activeTaskId !== null;
}

/**
 * Get the ID of the currently running task
 */
export function getActiveTaskId(): string | null {
	return activeTaskId;
}

// ============================================================================
// Task Tool Factory
// ============================================================================

/**
 * Creates the Task tool with access to the specified tools.
 *
 * The Task tool launches sub-agents of different types:
 * - 'explore': Fast exploration with read-only tools
 * - 'plan': Planning agent that can ask user questions
 *
 * @param availableTools - All tools that could be made available to sub-agents
 * @returns The Task tool definition
 */
export function createTaskTool(availableTools: Record<string, CoreTool>): {
	name: string;
	tool: CoreTool;
} {
	return defineTool({
		name: 'task',
		description: `Launch a specialized sub-agent to handle a task.

IMPORTANT: Only ONE tool call at a time. Never call multiple tools in parallel - always wait for each to complete.
For simple queries, prefer using direct tools (web_search, fetch_page, etc.) instead.

Available agent types:
- explore: Fast exploration agent with read-only tools. Use for:
  - Complex research requiring multiple search rounds
  - Information gathering across multiple sources
  - When you need autonomous exploration

- plan: Planning agent that can ask clarifying questions. Use for:
  - Designing implementation approaches
  - Complex tasks that need user input

When to use Task vs direct tools:
- Simple search → use web_search directly
- Fetch a URL → use web_fetch directly
- Complex multi-step research → use task(explore)

The sub-agent runs synchronously and returns its findings.
You should summarize the results for the user.`,
		parameters: z.object({
			subagent_type: AgentTypeSchema.describe(
				'Type of agent to launch: "explore" for research/information gathering, "plan" for implementation planning'
			),
			description: z
				.string()
				.max(50)
				.describe('Short 3-5 word summary of the task'),
			prompt: z.string().describe('Detailed task instructions for the sub-agent'),
			model: z
				.enum(['light', 'strong'])
				.optional()
				.describe('Model to use. "light" (default) for speed, "strong" for complex reasoning.'),
			max_turns: z
				.number()
				.int()
				.min(1)
				.max(20)
				.optional()
				.describe('Maximum API round-trips (default: 10)'),
		}),
		execute: async (params, context) => {
			const {
				subagent_type,
				description,
				prompt,
				model,
				max_turns,
			} = params;

			// Prevent parallel task execution
			if (activeTaskId !== null) {
				return {
					success: false,
					agentType: subagent_type,
					processId: 'blocked',
					description,
					response: '',
					toolCallCount: 0,
					toolCalls: [],
					duration: 0,
					error: `Cannot start task: another task is already running (${activeTaskId}). Wait for it to complete or use direct tools instead.`,
				} as TaskResult;
			}

			const agentConfig = getAgentTypeConfig(subagent_type);
			const processId = generateProcessId();

			// Acquire lock
			activeTaskId = processId;
			const startTime = Date.now();
			const toolCallSummaries: ToolCallSummary[] = [];
			const toolCallTimings = new Map<string, number>();

			// Resolve model
			const modelString = resolveAgentModel(subagent_type, model as 'light' | 'strong' | undefined);

			// Filter tools for this agent type
			const agentTools = filterToolsForAgentType(subagent_type, availableTools);

			// Build system prompt
			const systemPrompt = buildAgentSystemPrompt(subagent_type);

			// Emit start event
			agentEvents.emit({
				type: 'subAgentStart',
				processId,
				agentName: `task:${subagent_type}`,
				parentToolCallId: context?.toolCallId ?? 'unknown',
				task: description,
				model: modelString,
				timestamp: Date.now(),
			});

			try {
				const llm = createModel(modelString);
				const maxSteps = max_turns ?? agentConfig.maxTurns;

				const result = await generateText({
					model: llm,
					system: systemPrompt,
					messages: [{ role: 'user', content: prompt }],
					tools: agentTools,
					stopWhen: stepCountIs(maxSteps),
					maxOutputTokens: 4096,
					abortSignal: context?.abortSignal,
					onStepFinish: (step) => {
						// Process tool calls in this step
						const stepToolCalls = step.toolCalls ?? [];
						const stepToolResults = step.toolResults ?? [];

						for (const tc of stepToolCalls) {
							const toolCallId =
								'toolCallId' in tc ? (tc.toolCallId as string) : `tc_${Date.now()}`;
							const toolName =
								'toolName' in tc ? (tc.toolName as string) : 'unknown';
							const args =
								'input' in tc ? (tc.input as Record<string, unknown>) : {};

							// Find matching result
							const matchingResult = stepToolResults.find((tr) => {
								const trId = 'toolCallId' in tr ? tr.toolCallId : '';
								return trId === toolCallId;
							});

							const resultOutput =
								matchingResult && 'output' in matchingResult
									? matchingResult.output
									: null;

							// Extract timing from wrapped tool result
							let tcStartTime: number;
							let tcEndTime: number;
							let tcDuration: number;

							if (
								resultOutput &&
								typeof resultOutput === 'object' &&
								'__timing' in resultOutput
							) {
								const timing = (resultOutput as { __timing: { startTime: number; endTime: number; durationMs: number } }).__timing;
								tcStartTime = timing.startTime;
								tcEndTime = timing.endTime;
								tcDuration = timing.durationMs;
							} else {
								// Fallback: use current time (won't be accurate)
								tcStartTime = Date.now();
								tcEndTime = Date.now();
								tcDuration = 0;
							}

							// Emit running event (for UI to show it ran)
							if (!toolCallTimings.has(toolCallId)) {
								toolCallTimings.set(toolCallId, tcStartTime);
								agentEvents.emit({
									type: 'subAgentToolCall',
									processId,
									toolCallId,
									toolName,
									args,
									status: 'running',
									startTime: tcStartTime,
								});
							}

							if (matchingResult) {
								// Check for error
								const hasError =
									resultOutput &&
									typeof resultOutput === 'object' &&
									'success' in resultOutput &&
									resultOutput.success === false;

								toolCallSummaries.push({
									name: toolName,
									args,
									result: resultOutput,
									duration: tcDuration,
								});

								// Emit complete/error event with accurate timing
								agentEvents.emit({
									type: 'subAgentToolCall',
									processId,
									toolCallId,
									toolName,
									args,
									status: hasError ? 'error' : 'complete',
									result: resultOutput,
									error: hasError
										? ((resultOutput as { error?: string }).error ??
											'Unknown error')
										: undefined,
									startTime: tcStartTime,
									endTime: tcEndTime,
								});
							}
						}
					},
				});

				const duration = Date.now() - startTime;

				// Emit finish event
				agentEvents.emit({
					type: 'subAgentFinish',
					processId,
					agentName: `task:${subagent_type}`,
					status: 'success',
					result: result.text,
					duration,
					toolCallCount: toolCallSummaries.length,
					timestamp: Date.now(),
				});

				// Release lock
				activeTaskId = null;

				const taskResult: TaskResult = {
					success: true,
					agentType: subagent_type,
					processId,
					description,
					response: result.text,
					toolCallCount: toolCallSummaries.length,
					toolCalls: toolCallSummaries,
					duration,
				};

				return taskResult;
			} catch (error) {
				// Release lock on error
				activeTaskId = null;
				const duration = Date.now() - startTime;
				const errorMessage =
					error instanceof Error ? error.message : 'Unknown error';

				// Emit finish event with error
				agentEvents.emit({
					type: 'subAgentFinish',
					processId,
					agentName: `task:${subagent_type}`,
					status: 'error',
					error: errorMessage,
					duration,
					toolCallCount: toolCallSummaries.length,
					timestamp: Date.now(),
				});

				const taskResult: TaskResult = {
					success: false,
					agentType: subagent_type,
					processId,
					description,
					response: '',
					toolCallCount: toolCallSummaries.length,
					toolCalls: toolCallSummaries,
					duration,
					error: errorMessage,
				};

				return taskResult;
			}
		},
	});
}

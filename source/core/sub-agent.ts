import { z } from 'zod';
import { generateText, stepCountIs } from 'ai';
import { defineTool, createToolsRecord, type CoreTool } from './tools.js';
import { createModel } from './llm.js';
import { agentEvents, generateProcessId } from './events.js';

// ============================================================================
// Types
// ============================================================================

export interface SubAgentConfig {
	/** Tool name (snake_case) - used as the tool identifier */
	name: string;

	/** Description shown to the LLM when deciding to use this sub-agent */
	description: string;

	/** System prompt for the sub-agent */
	systemPrompt: string;

	/** Model to use (provider:model format, e.g., "google:gemini-2.5-flash") */
	model: string;

	/** Tools available to the sub-agent */
	tools: Array<{ name: string; tool: CoreTool }> | Record<string, CoreTool>;

	/** Maximum agentic steps (default: 10) */
	maxSteps?: number;

	/** Maximum output tokens (default: 4096) */
	maxOutputTokens?: number;

	/** Custom input schema. Default: { task: string, context?: string } */
	inputSchema?: z.ZodObject<z.ZodRawShape>;

	/** Transform input params to task string */
	taskTransformer?: (input: Record<string, unknown>) => string;

	/** Transform result before returning to main agent */
	resultTransformer?: (result: string, toolCalls: ToolCallSummary[]) => unknown;
}

export interface ToolCallSummary {
	name: string;
	args: Record<string, unknown>;
	result: unknown;
	duration: number;
}

export interface SubAgentResult {
	success: boolean;
	agentName: string;
	processId: string;
	response: string;
	toolCallCount: number;
	toolCalls: ToolCallSummary[];
	duration: number;
	error?: string;
}

// ============================================================================
// Default Schema
// ============================================================================

const defaultInputSchema = z.object({
	task: z.string().describe('The task for the sub-agent to complete'),
	context: z.string().optional().describe('Additional context or constraints'),
});

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a tool that wraps a sub-agent.
 * When called by the main agent, this spawns a complete agentic loop
 * with its own tools, emitting progress events to the event bus.
 *
 * @example
 * const researchAgent = createSubAgentTool({
 *   name: 'web_research_agent',
 *   description: 'Specialized agent for web research',
 *   systemPrompt: 'You are a research specialist...',
 *   model: 'google:gemini-2.5-flash',
 *   tools: [exaSearchTool, exaGetContentsTool],
 * });
 */
export function createSubAgentTool(config: SubAgentConfig): {
	name: string;
	tool: CoreTool;
} {
	const {
		name,
		description,
		systemPrompt,
		model,
		tools,
		maxSteps = 10,
		maxOutputTokens = 4096,
		inputSchema = defaultInputSchema,
		taskTransformer,
		resultTransformer,
	} = config;

	// Convert tools array to record if needed
	const toolsRecord = Array.isArray(tools) ? createToolsRecord(tools) : tools;

	return defineTool({
		name,
		description,
		parameters: inputSchema,
		execute: async (params, context) => {
			const processId = generateProcessId();
			const startTime = Date.now();
			const toolCallSummaries: ToolCallSummary[] = [];

			// Track tool call timings
			const toolCallTimings = new Map<string, number>();

			// Transform input to task string
			const task = taskTransformer
				? taskTransformer(params as Record<string, unknown>)
				: (params as { task: string; context?: string }).task +
					((params as { context?: string }).context
						? `\n\nContext: ${(params as { context?: string }).context}`
						: '');

			// Emit start event
			agentEvents.emit({
				type: 'subAgentStart',
				processId,
				agentName: name,
				parentToolCallId: context?.toolCallId ?? 'unknown',
				task,
				model,
				timestamp: Date.now(),
			});

			try {
				const llm = createModel(model);

				const result = await generateText({
					model: llm,
					system: systemPrompt,
					messages: [{ role: 'user', content: task }],
					tools: toolsRecord,
					stopWhen: stepCountIs(maxSteps),
					maxOutputTokens,
					abortSignal: context?.abortSignal,
					onStepFinish: (step) => {
						// Process each tool call in this step
						const stepToolCalls = step.toolCalls ?? [];
						const stepToolResults = step.toolResults ?? [];

						for (const tc of stepToolCalls) {
							const toolCallId =
								'toolCallId' in tc ? (tc.toolCallId as string) : `tc_${Date.now()}`;
							const toolName = 'toolName' in tc ? (tc.toolName as string) : 'unknown';
							const args =
								'input' in tc ? (tc.input as Record<string, unknown>) : {};

							// Record start time
							const tcStartTime = toolCallTimings.get(toolCallId) ?? Date.now();
							if (!toolCallTimings.has(toolCallId)) {
								toolCallTimings.set(toolCallId, tcStartTime);

								// Emit running event
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

							// Find matching result
							const matchingResult = stepToolResults.find((tr) => {
								const trId = 'toolCallId' in tr ? tr.toolCallId : '';
								return trId === toolCallId;
							});

							if (matchingResult) {
								const endTime = Date.now();
								const resultOutput =
									'output' in matchingResult ? matchingResult.output : null;

								// Check for error in result
								const hasError =
									resultOutput &&
									typeof resultOutput === 'object' &&
									'success' in resultOutput &&
									resultOutput.success === false;

								toolCallSummaries.push({
									name: toolName,
									args,
									result: resultOutput,
									duration: endTime - tcStartTime,
								});

								// Emit complete/error event
								agentEvents.emit({
									type: 'subAgentToolCall',
									processId,
									toolCallId,
									toolName,
									args,
									status: hasError ? 'error' : 'complete',
									result: resultOutput,
									error: hasError
										? ((resultOutput as { error?: string }).error ?? 'Unknown error')
										: undefined,
									startTime: tcStartTime,
									endTime,
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
					agentName: name,
					status: 'success',
					result: result.text,
					duration,
					toolCallCount: toolCallSummaries.length,
					timestamp: Date.now(),
				});

				// Build result
				const subAgentResult: SubAgentResult = {
					success: true,
					agentName: name,
					processId,
					response: result.text,
					toolCallCount: toolCallSummaries.length,
					toolCalls: toolCallSummaries,
					duration,
				};

				// Apply result transformer if provided
				if (resultTransformer) {
					return resultTransformer(result.text, toolCallSummaries);
				}

				return subAgentResult;
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				const duration = Date.now() - startTime;

				// Check if this was an abort
				const isAborted =
					err.name === 'AbortError' ||
					err.message.includes('aborted') ||
					context?.abortSignal?.aborted;

				// Emit error/cancelled finish event
				agentEvents.emit({
					type: 'subAgentFinish',
					processId,
					agentName: name,
					status: 'error',
					error: isAborted ? 'Cancelled' : err.message,
					duration,
					toolCallCount: toolCallSummaries.length,
					timestamp: Date.now(),
				});

				const errorResult: SubAgentResult = {
					success: false,
					agentName: name,
					processId,
					response: '',
					toolCallCount: toolCallSummaries.length,
					toolCalls: toolCallSummaries,
					duration,
					error: isAborted ? 'Cancelled' : err.message,
				};

				return errorResult;
			}
		},
	});
}

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText, streamObject, generateObject, type ModelMessage, type Tool, stepCountIs } from 'ai';
import { getConfig, getApiKey } from './config.js';
import { z } from 'zod';

// Re-export types with aliases for consistency
export type CoreMessage = ModelMessage;
export type CoreTool = Tool;

// Re-export the stream result type for consumers
export type { StreamTextResult, GenerateTextResult } from 'ai';

// ============================================================================
// Cost Tracking
// ============================================================================

/** Token pricing per 1M tokens (input/output) */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	// Anthropic models
	'claude-opus-4-5-20250514': { input: 15.0, output: 75.0 },
	'claude-sonnet-4-5-20250514': { input: 3.0, output: 15.0 },
	'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
	'claude-haiku-3-5-20241022': { input: 0.8, output: 4.0 },
	// Google models
	'gemini-2.5-pro-preview': { input: 1.25, output: 10.0 },
	'gemini-2.5-flash-preview': { input: 0.15, output: 0.60 },
	'gemini-2.0-flash': { input: 0.10, output: 0.40 },
	'gemini-3-pro-preview': { input: 1.25, output: 10.0 },
	'gemini-3-flash-preview': { input: 0.15, output: 0.60 },
};

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface CostTracking {
	model: string;
	usage: TokenUsage;
	costUSD: number;
}

/**
 * Calculates cost in USD for token usage
 */
export function calculateCost(model: string, usage: TokenUsage): number {
	// Extract model ID from provider:model format
	const modelId = model.includes(':') ? model.split(':')[1]! : model;
	const pricing = MODEL_PRICING[modelId] ?? { input: 1.0, output: 3.0 }; // Default fallback

	const inputCost = (usage.promptTokens / 1_000_000) * pricing.input;
	const outputCost = (usage.completionTokens / 1_000_000) * pricing.output;

	return inputCost + outputCost;
}

/**
 * Creates an Anthropic provider instance configured with the API key
 */
export function createAnthropicProvider() {
	const apiKey = getApiKey();
	return createAnthropic({
		apiKey,
	});
}

/**
 * Creates a Google Generative AI provider instance
 */
export function createGoogleProvider() {
	const apiKey = process.env['GOOGLE_GENERATIVE_AI_API_KEY'] || process.env['GOOGLE_AI_API_KEY'];
	return createGoogleGenerativeAI({ apiKey });
}

/**
 * Parses a model string in format "provider:model" and returns the appropriate model instance
 * Supported providers: anthropic, google
 * @param modelString Model string like "google:gemini-3-pro-preview" or "anthropic:claude-sonnet-4-5-20250514"
 */
export function parseModelString(modelString: string) {
	const [provider, ...modelParts] = modelString.split(':');
	const modelId = modelParts.join(':'); // Rejoin in case model name has colons

	switch (provider) {
		case 'google': {
			const google = createGoogleProvider();
			return google(modelId);
		}
		case 'anthropic': {
			const anthropic = createAnthropicProvider();
			return anthropic(modelId);
		}
		default: {
			// If no provider prefix, assume Anthropic
			const anthropic = createAnthropicProvider();
			return anthropic(modelString);
		}
	}
}

/**
 * Creates a language model instance with the specified or default model
 * @param model Optional model ID override (supports "provider:model" format)
 */
export function createModel(model?: string) {
	const config = getConfig();
	const modelString = model ?? config.defaultModel;
	return parseModelString(modelString);
}

export interface ReasoningConfig {
	enabled: boolean;
	budgetTokens?: number;
}

export interface StreamOptions {
	model?: string;
	system?: string;
	messages: CoreMessage[];
	tools?: Record<string, CoreTool>;
	maxSteps?: number;
	onStepFinish?: (event: StepFinishEvent) => void;
	abortSignal?: AbortSignal;
	reasoning?: ReasoningConfig;
}

export interface StepFinishEvent {
	text: string;
	toolCalls: ToolCallResult[];
	toolResults: ToolResultEntry[];
	finishReason: string;
}

export interface ToolCallResult {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface ToolResultEntry {
	toolCallId: string;
	toolName: string;
	result: unknown;
}

/**
 * Streams a response from the LLM with tool support
 * Returns an async iterable that yields text chunks and tool events
 */
export async function streamResponse(
	options: StreamOptions
) {
	const { model, system, messages, tools, maxSteps = 10, onStepFinish, abortSignal, reasoning } = options;

	const llm = createModel(model);

	// Build provider options for reasoning/thinking
	const providerOptions = reasoning?.enabled
		? {
				anthropic: {
					thinking: {
						type: 'enabled' as const,
						budgetTokens: reasoning.budgetTokens ?? 10000,
					},
				},
			}
		: undefined;

	const result = streamText({
		model: llm,
		system,
		messages,
		tools,
		stopWhen: stepCountIs(maxSteps),
		abortSignal,
		providerOptions,
		onStepFinish: onStepFinish
			? (event) => {
					// Map tool calls - handle both typed and dynamic
					const toolCalls: ToolCallResult[] = event.toolCalls?.map((tc) => ({
						toolCallId: 'toolCallId' in tc ? tc.toolCallId : '',
						toolName: 'toolName' in tc ? tc.toolName : '',
						args: 'input' in tc ? tc.input : {},
					})) ?? [];

					// Map tool results - handle both typed and dynamic
					const toolResults: ToolResultEntry[] = event.toolResults?.map((tr) => ({
						toolCallId: 'toolCallId' in tr ? tr.toolCallId : '',
						toolName: 'toolName' in tr ? tr.toolName : '',
						result: 'output' in tr ? tr.output : null,
					})) ?? [];

					onStepFinish({
						text: event.text ?? '',
						toolCalls,
						toolResults,
						finishReason: event.finishReason ?? 'unknown',
					});
				}
			: undefined,
	});

	return result;
}

export interface GenerateOptions {
	model?: string;
	system?: string;
	messages: CoreMessage[];
	tools?: Record<string, CoreTool>;
	maxSteps?: number;
	abortSignal?: AbortSignal;
}

/**
 * Generates a complete response from the LLM (non-streaming)
 */
export async function generateResponse(
	options: GenerateOptions
) {
	const { model, system, messages, tools, maxSteps = 10, abortSignal } = options;

	const llm = createModel(model);

	const result = await generateText({
		model: llm,
		system,
		messages,
		tools,
		stopWhen: stepCountIs(maxSteps),
		abortSignal,
	});

	return result;
}

// ============================================================================
// Structured Output Generation
// ============================================================================

export interface StructuredOutputOptions<T extends z.ZodType> {
	model?: string;
	system?: string;
	messages: CoreMessage[];
	schema: T;
	schemaName?: string;
	schemaDescription?: string;
	abortSignal?: AbortSignal;
}

/**
 * Generates a structured object response using the specified Zod schema
 * Uses the AI SDK's generateObject for reliable JSON output
 */
export async function generateStructuredOutput<T extends z.ZodType>(
	options: StructuredOutputOptions<T>
): Promise<{ object: z.infer<T>; usage: TokenUsage; costUSD: number }> {
	const { model, system, messages, schema, schemaName, schemaDescription, abortSignal } = options;

	const modelString = model ?? getConfig().defaultModel;
	const llm = createModel(modelString);

	const result = await generateObject({
		model: llm,
		system,
		messages,
		schema,
		schemaName,
		schemaDescription,
		abortSignal,
	});

	const usage: TokenUsage = {
		promptTokens: result.usage?.inputTokens ?? 0,
		completionTokens: result.usage?.outputTokens ?? 0,
		totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
	};

	return {
		object: result.object,
		usage,
		costUSD: calculateCost(modelString, usage),
	};
}

export interface StreamStructuredOutputOptions<T extends z.ZodType> {
	model?: string;
	system?: string;
	messages: CoreMessage[];
	schema: T;
	schemaName?: string;
	schemaDescription?: string;
	abortSignal?: AbortSignal;
	onPartialObject?: (partial: unknown) => void;
}

/**
 * Streams a structured object response using the specified Zod schema
 * Useful for large responses where you want to show partial results
 */
export async function streamStructuredOutput<T extends z.ZodType>(
	options: StreamStructuredOutputOptions<T>
): Promise<{ object: z.infer<T>; usage: TokenUsage; costUSD: number }> {
	const { model, system, messages, schema, schemaName, schemaDescription, abortSignal, onPartialObject } = options;

	const modelString = model ?? getConfig().defaultModel;
	const llm = createModel(modelString);

	const result = streamObject({
		model: llm,
		system,
		messages,
		schema,
		schemaName,
		schemaDescription,
		abortSignal,
	});

	// Process the stream
	for await (const partialObject of result.partialObjectStream) {
		if (onPartialObject) {
			onPartialObject(partialObject);
		}
	}

	// Get final result
	const finalObject = await result.object;
	const usage = await result.usage;

	const tokenUsage: TokenUsage = {
		promptTokens: usage?.inputTokens ?? 0,
		completionTokens: usage?.outputTokens ?? 0,
		totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
	};

	return {
		object: finalObject,
		usage: tokenUsage,
		costUSD: calculateCost(modelString, tokenUsage),
	};
}

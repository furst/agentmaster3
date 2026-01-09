import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText, type ModelMessage, type Tool, stepCountIs } from 'ai';
import { getConfig, getApiKey } from './config.js';

// Re-export types with aliases for consistency
export type CoreMessage = ModelMessage;
export type CoreTool = Tool;

// Re-export the stream result type for consumers
export type { StreamTextResult, GenerateTextResult } from 'ai';

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

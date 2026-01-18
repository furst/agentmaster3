import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';
import { getConfig } from './config.js';

export type Provider = 'anthropic' | 'google' | 'openai';

export interface ModelSpec {
	provider: Provider;
	model: string;
}

/**
 * Parse a model spec string like "google:gemini-2.0-flash-exp" or "anthropic:claude-sonnet-4-20250514"
 */
export function parseModelSpec(spec: string): ModelSpec {
	const colonIndex = spec.indexOf(':');
	if (colonIndex === -1) {
		// Default to anthropic if no provider specified
		return { provider: 'anthropic', model: spec };
	}

	const provider = spec.slice(0, colonIndex) as Provider;
	const model = spec.slice(colonIndex + 1);

	if (!['anthropic', 'google', 'openai'].includes(provider)) {
		throw new Error(`Unknown provider: ${provider}. Supported: anthropic, google, openai`);
	}

	return { provider, model };
}

/**
 * Create a language model instance from any supported provider
 */
export function createMultiModel(spec: string): LanguageModel {
	const { provider, model } = parseModelSpec(spec);

	switch (provider) {
		case 'anthropic': {
			const config = getConfig();
			const apiKey = config.anthropicApiKey;
			if (!apiKey) {
				throw new Error('ANTHROPIC_API_KEY not configured');
			}
			const anthropic = createAnthropic({ apiKey });
			return anthropic(model);
		}

		case 'google': {
			const apiKey = process.env['GOOGLE_AI_API_KEY'];
			if (!apiKey) {
				throw new Error('GOOGLE_AI_API_KEY not configured');
			}
			const google = createGoogleGenerativeAI({ apiKey });
			return google(model);
		}

		case 'openai': {
			const apiKey = process.env['OPENAI_API_KEY'];
			if (!apiKey) {
				throw new Error('OPENAI_API_KEY not configured');
			}
			const openai = createOpenAI({ apiKey });
			return openai(model);
		}

		default:
			throw new Error(`Unknown provider: ${provider}`);
	}
}

/**
 * Generate text using a specific model spec
 */
export async function generateWithModel(
	modelSpec: string,
	options: {
		system?: string;
		prompt: string;
		maxOutputTokens?: number;
	}
): Promise<string> {
	const model = createMultiModel(modelSpec);

	const result = await generateText({
		model,
		system: options.system,
		prompt: options.prompt,
		maxOutputTokens: options.maxOutputTokens ?? 4096,
	});

	return result.text;
}

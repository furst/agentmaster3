import { z } from 'zod';
import { registerConfigSection, getConfigSection, getModelsConfig } from '@conductor/core';

/**
 * Finance agent configuration schema
 */
export const FinanceConfigSchema = z.object({
	// Model configuration (provider:model format)
	// These are optional - if not set, falls back to shared models config
	lightModel: z.string().optional(),
	strongModel: z.string().optional(),

	// Reasoning/thinking configuration
	reasoning: z
		.object({
			enabled: z.boolean().default(false),
			budgetTokens: z.number().default(10000),
		})
		.default({}),

	// Local data sources
	newsletterDirectory: z.string().default('./newsletters'),
	mindsetPath: z.string().default('./investment-mindset.md'),
	holdingsDirectory: z.string().optional().default('./data/holdings').describe('Directory for holdings screenshots and parsed data'),

	// Online research sources
	researchSources: z
		.object({
			social: z
				.array(z.string())
				.default(['reddit.com', 'twitter.com', 'x.com', 'news.ycombinator.com']),
			news: z
				.array(z.string())
				.default([
					'seekingalpha.com',
					'finance.yahoo.com',
					'marketwatch.com',
					'bloomberg.com',
				]),
			redditSubs: z
				.array(z.string())
				.default(['investing', 'stocks', 'wallstreetbets', 'options']),
		})
		.default({}),
});

export type FinanceConfig = z.infer<typeof FinanceConfigSchema>;

// Register the finance config section
registerConfigSection('finance', FinanceConfigSchema);

// Cached resolved config
let cachedFinanceConfig: (FinanceConfig & { lightModel: string; strongModel: string }) | null = null;

/**
 * Gets finance-specific configuration with defaults
 * Finance-specific model settings override shared models config
 */
export function getFinanceConfig(): FinanceConfig & { lightModel: string; strongModel: string } {
	if (cachedFinanceConfig) {
		return cachedFinanceConfig;
	}

	const modelsConfig = getModelsConfig();
	const financeConfig = getConfigSection<FinanceConfig>('finance');

	// Use shared models config as fallback for finance-specific models
	cachedFinanceConfig = {
		...financeConfig,
		lightModel: financeConfig.lightModel ?? modelsConfig.light,
		strongModel: financeConfig.strongModel ?? modelsConfig.strong,
		reasoning: financeConfig.reasoning.enabled
			? financeConfig.reasoning
			: modelsConfig.reasoning,
	};
	return cachedFinanceConfig;
}

/**
 * Clears cached finance config
 */
export function clearFinanceConfigCache(): void {
	cachedFinanceConfig = null;
}

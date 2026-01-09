import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared models configuration schema
 * Available to all agents for consistent model usage
 */
const ModelsConfigSchema = z.object({
	// Default light model for fast, cheap tasks (PDF summarization, image parsing, etc.)
	light: z.string().default('google:gemini-3-flash-preview'),
	// Default strong model for complex reasoning tasks
	strong: z.string().default('google:gemini-3-pro-preview'),
	// Reasoning/thinking configuration
	reasoning: z
		.object({
			enabled: z.boolean().default(false),
			budgetTokens: z.number().default(10000),
		})
		.default({}),
});

/**
 * News agent configuration schema
 */
const NewsConfigSchema = z.object({
	sites: z.array(z.string()).default([
		'techcrunch.com',
		'theverge.com',
		'arstechnica.com',
		'bbc.com/news',
		'reuters.com',
	]),
	interests: z.array(z.string()).default([
		'technology',
		'artificial intelligence',
		'startups',
	]),
	defaultCount: z.number().default(5),
});

/**
 * Obsidian vault configuration schema
 */
const ObsidianConfigSchema = z.object({
	vaultPath: z.string().describe('Absolute path to the Obsidian vault directory'),
	// Safety limits
	maxFileSizeBytes: z.number().default(100 * 1024), // 100KB default max file size
	maxWriteSizeBytes: z.number().default(50 * 1024), // 50KB default max write size
	backupOnWrite: z.boolean().default(true), // Create .bak backup before overwriting
	allowedSubfolders: z.array(z.string()).optional(), // If set, only allow operations in these subfolders
});

/**
 * Finance agent configuration schema
 */
const FinanceConfigSchema = z.object({
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
	researchDirectory: z.string().default('./data/research').describe('Directory for research notes and plans'),

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

/**
 * Project-level configuration schema
 * This is separate from user-level config (~/.config/agentmaster/)
 */
const ProjectConfigSchema = z.object({
	// Shared model configuration for all agents
	models: ModelsConfigSchema.optional(),
	news: NewsConfigSchema.optional(),
	finance: FinanceConfigSchema.optional(),
	obsidian: ObsidianConfigSchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type NewsConfig = z.infer<typeof NewsConfigSchema>;
export type FinanceConfig = z.infer<typeof FinanceConfigSchema>;
export type ObsidianConfig = z.infer<typeof ObsidianConfigSchema>;

const CONFIG_FILENAME = 'config.json';

let cachedProjectConfig: ProjectConfig | null = null;

/**
 * Gets the project config file path
 */
function getProjectConfigPath(): string {
	return join(process.cwd(), CONFIG_FILENAME);
}

/**
 * Loads project-level configuration from ./config.json
 * Falls back to defaults if file doesn't exist
 */
export function getProjectConfig(): ProjectConfig {
	if (cachedProjectConfig) {
		return cachedProjectConfig;
	}

	const configPath = getProjectConfigPath();
	let fileConfig: Partial<ProjectConfig> = {};

	if (existsSync(configPath)) {
		try {
			const content = readFileSync(configPath, 'utf-8');
			fileConfig = JSON.parse(content) as Partial<ProjectConfig>;
		} catch {
			// Ignore parse errors, use defaults
		}
	}

	const result = ProjectConfigSchema.safeParse(fileConfig);

	if (!result.success) {
		console.error('Invalid project configuration:', result.error.format());
		cachedProjectConfig = {};
		return cachedProjectConfig;
	}

	cachedProjectConfig = result.data;
	return cachedProjectConfig;
}

/**
 * Gets news-specific configuration with defaults
 */
export function getNewsConfig(): NewsConfig {
	const projectConfig = getProjectConfig();
	return NewsConfigSchema.parse(projectConfig.news ?? {});
}

/**
 * Gets shared models configuration with defaults
 * Use this for consistent model access across all agents
 */
export function getModelsConfig(): ModelsConfig {
	const projectConfig = getProjectConfig();
	return ModelsConfigSchema.parse(projectConfig.models ?? {});
}

/**
 * Gets finance-specific configuration with defaults
 * Finance-specific model settings override shared models config
 */
export function getFinanceConfig(): FinanceConfig & { lightModel: string; strongModel: string } {
	const projectConfig = getProjectConfig();
	const modelsConfig = getModelsConfig();
	const financeConfig = FinanceConfigSchema.parse(projectConfig.finance ?? {});

	// Use shared models config as fallback for finance-specific models
	return {
		...financeConfig,
		lightModel: financeConfig.lightModel ?? modelsConfig.light,
		strongModel: financeConfig.strongModel ?? modelsConfig.strong,
		reasoning: financeConfig.reasoning.enabled
			? financeConfig.reasoning
			: modelsConfig.reasoning,
	};
}

/**
 * Gets obsidian vault configuration
 * Throws error if vaultPath is not configured
 */
export function getObsidianConfig(): ObsidianConfig {
	const projectConfig = getProjectConfig();
	if (!projectConfig.obsidian?.vaultPath) {
		throw new Error(
			'Obsidian vault not configured. Add obsidian.vaultPath to ./config.json'
		);
	}
	return ObsidianConfigSchema.parse(projectConfig.obsidian);
}

/**
 * Clears the cached project config (useful for testing)
 */
export function clearProjectConfigCache(): void {
	cachedProjectConfig = null;
}

export { getProjectConfigPath };

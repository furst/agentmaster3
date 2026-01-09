import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
	lightModel: z.string().default('google:gemini-3-flash-preview'),
	strongModel: z.string().default('anthropic:claude-sonnet-4-5-20250514'),

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
	news: NewsConfigSchema.optional(),
	finance: FinanceConfigSchema.optional(),
	obsidian: ObsidianConfigSchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
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
 * Gets finance-specific configuration with defaults
 */
export function getFinanceConfig(): FinanceConfig {
	const projectConfig = getProjectConfig();
	return FinanceConfigSchema.parse(projectConfig.finance ?? {});
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

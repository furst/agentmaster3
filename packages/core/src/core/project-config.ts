import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared models configuration schema
 * Available to all agents for consistent model usage
 * Note: light and strong models must be configured in config.json
 */
export const ModelsConfigSchema = z.object({
	// Light model for fast, cheap tasks (PDF summarization, image parsing, etc.)
	light: z.string().optional().describe('Light model for fast tasks (e.g., "google:gemini-3-flash-preview", "anthropic:claude-3-haiku")'),
	// Strong model for complex reasoning tasks
	strong: z.string().optional().describe('Strong model for complex tasks (e.g., "google:gemini-3-pro-preview", "anthropic:claude-sonnet-4")'),
	// Reasoning/thinking configuration
	reasoning: z
		.object({
			enabled: z.boolean().default(false),
			budgetTokens: z.number().default(10000),
		})
		.default({}),
});

/**
 * Obsidian vault configuration schema
 */
export const ObsidianConfigSchema = z.object({
	vaultPath: z.string().describe('Absolute path to the Obsidian vault directory'),
	// Safety limits
	maxFileSizeBytes: z.number().default(100 * 1024), // 100KB default max file size
	maxWriteSizeBytes: z.number().default(50 * 1024), // 50KB default max write size
	backupOnWrite: z.boolean().default(true), // Create .bak backup before overwriting
	allowedSubfolders: z.array(z.string()).optional(), // If set, only allow operations in these subfolders
});

/**
 * Memory configuration schema
 */
export const MemoryConfigSchema = z.object({
	// Directory for agent memory files
	directory: z.string().default('./data/memory'),
});

/**
 * Base project configuration schema
 * This is separate from user-level config (~/.config/conductor/)
 */
const BaseProjectConfigSchema = z.object({
	// Shared model configuration for all agents
	models: ModelsConfigSchema.optional(),
	obsidian: ObsidianConfigSchema.optional(),
	memory: MemoryConfigSchema.optional(),
});

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ObsidianConfig = z.infer<typeof ObsidianConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type BaseProjectConfig = z.infer<typeof BaseProjectConfigSchema>;

/**
 * Obsidian hooks for customizing tag inference and frontmatter generation
 * These are runtime hooks, not config file settings
 */
export type ObsidianTagInferenceFunction = (content: string, path: string) => string[];
export type ObsidianFrontmatterGenerator = (tags: string[], type?: string) => string;

interface ObsidianHooks {
	tagInference?: ObsidianTagInferenceFunction;
	frontmatterGenerator?: ObsidianFrontmatterGenerator;
}

// Runtime hooks storage
let obsidianHooks: ObsidianHooks = {};

/**
 * Register custom obsidian hooks for tag inference and frontmatter generation
 */
export function registerObsidianHooks(hooks: ObsidianHooks): void {
	obsidianHooks = { ...obsidianHooks, ...hooks };
}

/**
 * Get the registered obsidian hooks
 */
export function getObsidianHooks(): ObsidianHooks {
	return obsidianHooks;
}

/**
 * Clear obsidian hooks (useful for testing)
 */
export function clearObsidianHooks(): void {
	obsidianHooks = {};
}

// Type for custom config sections registered by apps
type ConfigSection<T> = {
	schema: z.ZodType<T>;
	cache: T | null;
};

// Registry for custom config sections
const configSections = new Map<string, ConfigSection<unknown>>();

const CONFIG_FILENAME = 'config.json';

// Additional config paths to merge (app-specific configs)
const additionalConfigPaths: string[] = [];

// Caches for parsed configs
let cachedProjectConfig: Record<string, unknown> | null = null;
let cachedModelsConfig: ModelsConfig | null = null;
let cachedObsidianConfig: ObsidianConfig | null = null;
let cachedMemoryConfig: MemoryConfig | null = null;

/**
 * Deep merge two objects, with source taking precedence
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const result = { ...target };
	for (const key of Object.keys(source)) {
		const sourceValue = source[key];
		const targetValue = result[key];
		if (
			sourceValue !== null &&
			typeof sourceValue === 'object' &&
			!Array.isArray(sourceValue) &&
			targetValue !== null &&
			typeof targetValue === 'object' &&
			!Array.isArray(targetValue)
		) {
			result[key] = deepMerge(
				targetValue as Record<string, unknown>,
				sourceValue as Record<string, unknown>
			);
		} else {
			result[key] = sourceValue;
		}
	}
	return result;
}

/**
 * Register an additional config file path to merge
 * App-specific configs are merged on top of the root config
 * Call this before accessing any config values
 */
export function registerAppConfig(configPath: string): void {
	if (!additionalConfigPaths.includes(configPath)) {
		additionalConfigPaths.push(configPath);
		// Clear cache so next access will re-merge
		clearProjectConfigCache();
	}
}

/**
 * Gets the project config file path
 */
export function getProjectConfigPath(): string {
	return join(process.cwd(), CONFIG_FILENAME);
}

/**
 * Loads project-level configuration from ./config.json
 * Merges with any registered app-specific configs
 * Falls back to defaults if files don't exist
 */
export function getProjectConfig(): Record<string, unknown> {
	if (cachedProjectConfig) {
		return cachedProjectConfig;
	}

	// Load root config
	const configPath = getProjectConfigPath();
	let mergedConfig: Record<string, unknown> = {};

	if (existsSync(configPath)) {
		try {
			const content = readFileSync(configPath, 'utf-8');
			mergedConfig = JSON.parse(content) as Record<string, unknown>;
		} catch {
			// Ignore parse errors, use defaults
		}
	}

	// Merge additional app configs (later configs take precedence)
	for (const appConfigPath of additionalConfigPaths) {
		if (existsSync(appConfigPath)) {
			try {
				const content = readFileSync(appConfigPath, 'utf-8');
				const appConfig = JSON.parse(content) as Record<string, unknown>;
				mergedConfig = deepMerge(mergedConfig, appConfig);
			} catch {
				// Ignore parse errors for app configs
			}
		}
	}

	cachedProjectConfig = mergedConfig;
	return cachedProjectConfig;
}

/**
 * Validated models config with required light and strong fields
 */
export interface ValidatedModelsConfig {
	light: string;
	strong: string;
	reasoning: { enabled: boolean; budgetTokens: number };
}

/**
 * Gets shared models configuration
 * Throws helpful error if models are not configured
 * Use this for consistent model access across all agents
 */
export function getModelsConfig(): ValidatedModelsConfig {
	if (cachedModelsConfig) {
		// Validate cached config has required fields
		if (!cachedModelsConfig.light || !cachedModelsConfig.strong) {
			throw new Error(
				'Models not configured. Add models.light and models.strong to ./config.json\n' +
				'Example:\n' +
				'{\n' +
				'  "models": {\n' +
				'    "light": "google:gemini-3-flash-preview",\n' +
				'    "strong": "google:gemini-3-pro-preview"\n' +
				'  }\n' +
				'}'
			);
		}
		return cachedModelsConfig as ValidatedModelsConfig;
	}
	const projectConfig = getProjectConfig();
	const parsed = ModelsConfigSchema.parse(projectConfig['models'] ?? {});

	if (!parsed.light || !parsed.strong) {
		throw new Error(
			'Models not configured. Add models.light and models.strong to ./config.json\n' +
			'Example:\n' +
			'{\n' +
			'  "models": {\n' +
			'    "light": "google:gemini-3-flash-preview",\n' +
			'    "strong": "google:gemini-3-pro-preview"\n' +
			'  }\n' +
			'}'
		);
	}

	cachedModelsConfig = parsed as ModelsConfig;
	return parsed as ValidatedModelsConfig;
}

/**
 * Gets obsidian vault configuration
 * Throws error if vaultPath is not configured
 */
export function getObsidianConfig(): ObsidianConfig {
	if (cachedObsidianConfig) {
		return cachedObsidianConfig;
	}
	const projectConfig = getProjectConfig();
	const obsidianConfig = projectConfig['obsidian'] as Record<string, unknown> | undefined;
	if (!obsidianConfig?.['vaultPath']) {
		throw new Error(
			'Obsidian vault not configured. Add obsidian.vaultPath to ./config.json'
		);
	}
	cachedObsidianConfig = ObsidianConfigSchema.parse(obsidianConfig);
	return cachedObsidianConfig;
}

/**
 * Gets memory configuration with defaults
 */
export function getMemoryConfig(): MemoryConfig {
	if (cachedMemoryConfig) {
		return cachedMemoryConfig;
	}
	const projectConfig = getProjectConfig();
	cachedMemoryConfig = MemoryConfigSchema.parse(projectConfig['memory'] ?? {});
	return cachedMemoryConfig;
}

/**
 * Register a custom config section
 * Used by apps to add their own configuration sections
 */
export function registerConfigSection<T>(key: string, schema: z.ZodType<T>): void {
	configSections.set(key, {
		schema,
		cache: null,
	} as ConfigSection<T>);
}

/**
 * Get a registered config section
 * Returns parsed and validated config for the section
 */
export function getConfigSection<T>(key: string): T {
	const section = configSections.get(key) as ConfigSection<T> | undefined;
	if (!section) {
		throw new Error("Config section '" + key + "' not registered. Call registerConfigSection first.");
	}

	if (section.cache !== null) {
		return section.cache;
	}

	const projectConfig = getProjectConfig();
	const sectionConfig = projectConfig[key] ?? {};
	section.cache = section.schema.parse(sectionConfig);
	return section.cache;
}

/**
 * Clears all cached configs (useful for testing or config reload)
 */
export function clearProjectConfigCache(): void {
	cachedProjectConfig = null;
	cachedModelsConfig = null;
	cachedObsidianConfig = null;
	cachedMemoryConfig = null;
	// Clear all custom section caches
	for (const section of configSections.values()) {
		section.cache = null;
	}
}

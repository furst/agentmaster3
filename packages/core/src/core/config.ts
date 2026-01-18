import { z } from 'zod';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Load .env file from current directory
loadDotenv();

/**
 * Configuration schema for conductor CLI
 */
const AgentConfigSchema = z.object({
	model: z.string().optional(),
	maxIterations: z.number().optional(),
});

const ConfigSchema = z.object({
	anthropicApiKey: z.string().optional(),
	defaultModel: z.string().default('claude-sonnet-4-20250514'),
	maxIterations: z.number().default(10),
	agents: z.record(AgentConfigSchema).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

const CONFIG_DIR = join(homedir(), '.config', 'conductor');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: Config = {
	defaultModel: 'claude-sonnet-4-20250514',
	maxIterations: 10,
};

let cachedConfig: Config | null = null;

/**
 * Ensures the config directory exists
 */
function ensureConfigDir(): void {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true });
	}
}

/**
 * Creates a default config file if it doesn't exist
 */
function createDefaultConfig(): void {
	ensureConfigDir();
	if (!existsSync(CONFIG_PATH)) {
		writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
	}
}

/**
 * Loads and validates configuration from file and environment
 * @returns Validated configuration object
 */
export function getConfig(): Config {
	if (cachedConfig) {
		return cachedConfig;
	}

	let fileConfig: Partial<Config> = {};

	// Try to load from file
	if (existsSync(CONFIG_PATH)) {
		try {
			const content = readFileSync(CONFIG_PATH, 'utf-8');
			fileConfig = JSON.parse(content) as Partial<Config>;
		} catch {
			// Ignore parse errors, use defaults
		}
	} else {
		// Create default config file
		createDefaultConfig();
	}

	// Merge with environment variables
	const envConfig: Partial<Config> = {};

	if (process.env['ANTHROPIC_API_KEY']) {
		envConfig.anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
	}

	if (process.env['CONDUCTOR_MODEL']) {
		envConfig.defaultModel = process.env['CONDUCTOR_MODEL'];
	}

	// Parse and validate merged config
	const merged = { ...DEFAULT_CONFIG, ...fileConfig, ...envConfig };
	const result = ConfigSchema.safeParse(merged);

	if (!result.success) {
		console.error('Invalid configuration:', result.error.format());
		cachedConfig = DEFAULT_CONFIG;
		return cachedConfig;
	}

	cachedConfig = result.data;
	return cachedConfig;
}

/**
 * Gets the API key, throwing an error if not configured
 * @returns The Anthropic API key
 */
export function getApiKey(): string {
	const config = getConfig();
	const apiKey = config.anthropicApiKey;

	if (!apiKey) {
		throw new Error(
			'Anthropic API key not configured. Set ANTHROPIC_API_KEY in a .env file, environment variable, or add anthropicApiKey to ~/.config/conductor/config.json'
		);
	}

	return apiKey;
}

/**
 * Gets configuration for a specific agent
 * @param agentName Name of the agent
 * @returns Agent-specific config merged with defaults
 */
export function getAgentConfig(agentName: string): AgentConfig & { model: string; maxIterations: number } {
	const config = getConfig();
	const agentConfig = config.agents?.[agentName] ?? {};

	return {
		model: agentConfig.model ?? config.defaultModel,
		maxIterations: agentConfig.maxIterations ?? config.maxIterations,
	};
}

/**
 * Clears the cached config (useful for testing)
 */
export function clearConfigCache(): void {
	cachedConfig = null;
}

export { CONFIG_PATH, CONFIG_DIR };

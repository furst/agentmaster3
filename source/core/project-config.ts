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
 * Project-level configuration schema
 * This is separate from user-level config (~/.config/agentmaster/)
 */
const ProjectConfigSchema = z.object({
	news: NewsConfigSchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type NewsConfig = z.infer<typeof NewsConfigSchema>;

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
 * Clears the cached project config (useful for testing)
 */
export function clearProjectConfigCache(): void {
	cachedProjectConfig = null;
}

export { getProjectConfigPath };

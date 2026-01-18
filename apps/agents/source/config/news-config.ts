import { z } from 'zod';
import { registerConfigSection, getConfigSection } from '@conductor/core';

/**
 * News agent configuration schema
 */
export const NewsConfigSchema = z.object({
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

export type NewsConfig = z.infer<typeof NewsConfigSchema>;

// Register the news config section
registerConfigSection('news', NewsConfigSchema);

/**
 * Gets news-specific configuration with defaults
 */
export function getNewsConfig(): NewsConfig {
	return getConfigSection<NewsConfig>('news');
}

import { z } from 'zod';
import { defineTool } from '../core/tools.js';

const JINA_READER_BASE = 'https://r.jina.ai';

/**
 * Jina Reader tool - fetches LIVE content from URLs and converts to clean markdown.
 * Unlike web_fetch (Exa), this actually scrapes the current page content.
 * No API key required for basic usage (rate-limited).
 */
export const jinaReaderTool = defineTool({
	name: 'fetch_page',
	description: `Fetch LIVE content from a webpage and convert to clean markdown.

Use this for:
- News site homepages (gets current headlines, not cached)
- Any page where you need the latest content
- Pages that might have changed recently

Returns clean text/markdown without HTML clutter.

Note: This fetches live content. For cached/indexed content from search results, use web_fetch instead.`,
	parameters: z.object({
		url: z.string().url().describe('The URL to fetch (e.g., "https://news.ycombinator.com")'),
	}),
	execute: async ({ url }) => {
		try {
			// Jina Reader converts any URL to clean markdown
			const jinaUrl = `${JINA_READER_BASE}/${url}`;

			const response = await fetch(jinaUrl, {
				headers: {
					Accept: 'text/plain',
				},
			});

			if (!response.ok) {
				return {
					success: false,
					url,
					error: `Failed to fetch: ${response.status} ${response.statusText}`,
				};
			}

			const content = await response.text();

			// Extract some metadata
			const lines = content.split('\n');
			const titleMatch = content.match(/^#\s+(.+)$/m);
			const title = titleMatch ? titleMatch[1] : null;

			// Count links (markdown format)
			const linkMatches = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
			const links = linkMatches
				.slice(0, 20)
				.map((match) => {
					const linkMatch = match.match(/\[([^\]]+)\]\(([^)]+)\)/);
					return linkMatch ? { text: linkMatch[1], url: linkMatch[2] } : null;
				})
				.filter(Boolean);

			return {
				success: true,
				url,
				title,
				contentLength: content.length,
				lineCount: lines.length,
				linkCount: linkMatches.length,
				links,
				content: content.slice(0, 15000), // Limit content size
			};
		} catch (error) {
			return {
				success: false,
				url,
				error: (error as Error).message,
			};
		}
	},
});

import { z } from 'zod';
import { defineTool } from '../core/tools.js';

const JINA_READER_BASE = 'https://r.jina.ai';

/**
 * Jina Reader tool - fetches URLs and converts to clean markdown
 * No API key required for basic usage (rate-limited)
 */
export const jinaReaderTool = defineTool({
	name: 'fetch_page',
	description: `Fetch a webpage and convert it to clean, readable markdown. Use this to:
- Get the latest content from news site homepages
- Read article pages for summarization
- Extract links and content from any webpage

The tool returns clean text/markdown without HTML clutter, making it easy to extract information.`,
	parameters: z.object({
		url: z.string().url().describe('The URL to fetch (e.g., "https://aftonbladet.se")'),
	}),
	execute: async ({ url }) => {
		try {
			// Jina Reader converts any URL to clean markdown
			const jinaUrl = `${JINA_READER_BASE}/${url}`;

			const response = await fetch(jinaUrl, {
				headers: {
					'Accept': 'text/plain',
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
			const links = linkMatches.slice(0, 20).map((match) => {
				const linkMatch = match.match(/\[([^\]]+)\]\(([^)]+)\)/);
				return linkMatch ? { text: linkMatch[1], url: linkMatch[2] } : null;
			}).filter(Boolean);

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

import { z } from 'zod';
import { defineTool } from '../core/tools.js';

const EXA_API_BASE = 'https://api.exa.ai';

// Default max characters per article - generous limit since sub-agents
// use resultTransformer to return only summaries, not raw content
const DEFAULT_MAX_TEXT_CHARS = 20000;

/**
 * Truncate text to prevent token explosion, trying to cut at sentence boundaries
 */
function truncateText(
	text: string,
	maxChars: number
): { text: string; truncated: boolean; originalLength: number } {
	const originalLength = text.length;
	if (text.length <= maxChars) {
		return { text, truncated: false, originalLength };
	}
	// Try to truncate at a sentence boundary
	const sliced = text.slice(0, maxChars);
	const lastSentence = sliced.lastIndexOf('. ');
	const cutPoint = lastSentence > maxChars * 0.7 ? lastSentence + 1 : maxChars;
	return {
		text: text.slice(0, cutPoint) + '\n\n[Content truncated...]',
		truncated: true,
		originalLength,
	};
}

function getExaApiKey(): string {
	const apiKey = process.env['EXA_API_KEY'];
	if (!apiKey) {
		throw new Error(
			'EXA_API_KEY environment variable is not set. Get your API key from https://exa.ai'
		);
	}
	return apiKey;
}

interface ExaSearchResult {
	title: string;
	url: string;
	publishedDate?: string;
	author?: string;
	score: number;
	id: string;
	text?: string;
}

interface ExaSearchResponse {
	results: ExaSearchResult[];
	autopromptString?: string;
}

interface ExaContentsResult {
	title: string;
	url: string;
	publishedDate?: string;
	author?: string;
	text: string;
	highlights?: string[];
}

interface ExaContentsResponse {
	results: ExaContentsResult[];
}

/**
 * Exa search tool - semantic web search
 */
export const exaSearchTool = defineTool({
	name: 'exa_search',
	description: `Search the web using Exa's semantic search engine. Returns relevant URLs and metadata.

Use includeText=true for sites that block direct fetching (Reddit, Twitter). This gets content directly from Exa's index without needing exa_get_contents.

For other sites, you can search first, then use exa_get_contents to fetch full text.`,
	parameters: z.object({
		query: z.string().describe('The search query - can be natural language'),
		numResults: z
			.number()
			.optional()
			.default(10)
			.describe('Number of results to return (default 10, max 100)'),
		includeDomains: z
			.array(z.string())
			.optional()
			.describe('Only include results from these domains (e.g., ["techcrunch.com", "bbc.com"])'),
		excludeDomains: z
			.array(z.string())
			.optional()
			.describe('Exclude results from these domains'),
		startPublishedDate: z
			.string()
			.optional()
			.describe('Only include results published after this date (ISO format, e.g., "2024-01-01")'),
		category: z
			.enum(['news', 'company', 'research paper', 'tweet', 'github', 'pdf'])
			.optional()
			.describe('Filter results by content category'),
		includeText: z
			.boolean()
			.optional()
			.default(false)
			.describe('Include full text content in results. Use this for sites that block direct fetching (like Reddit). Avoids need for exa_get_contents.'),
	}),
	execute: async ({
		query,
		numResults,
		includeDomains,
		excludeDomains,
		startPublishedDate,
		category,
		includeText,
	}) => {
		try {
			const apiKey = getExaApiKey();

			const body: Record<string, unknown> = {
				query,
				numResults: Math.min(numResults ?? 10, 100),
				useAutoprompt: true,
			};

			if (includeDomains && includeDomains.length > 0) {
				body['includeDomains'] = includeDomains;
			}

			if (excludeDomains && excludeDomains.length > 0) {
				body['excludeDomains'] = excludeDomains;
			}

			if (startPublishedDate) {
				body['startPublishedDate'] = startPublishedDate;
			}

			if (category) {
				body['category'] = category;
			}

			if (includeText) {
				body['contents'] = {
					text: true,
				};
			}

			const response = await fetch(`${EXA_API_BASE}/search`, {
				method: 'POST',
				headers: {
					'x-api-key': apiKey,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errorText = await response.text();
				return {
					success: false,
					error: `Exa API error: ${response.status} - ${errorText}`,
				};
			}

			const data = (await response.json()) as ExaSearchResponse;

			return {
				success: true,
				query,
				resultCount: data.results.length,
				results: data.results.map((r) => {
					// Truncate text if present to prevent token explosion
					if (r.text) {
						const { text, truncated, originalLength } = truncateText(
							r.text,
							DEFAULT_MAX_TEXT_CHARS
						);
						return {
							title: r.title,
							url: r.url,
							publishedDate: r.publishedDate,
							author: r.author,
							score: r.score,
							text,
							truncated,
							originalLength,
						};
					}
					return {
						title: r.title,
						url: r.url,
						publishedDate: r.publishedDate,
						author: r.author,
						score: r.score,
					};
				}),
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

/**
 * Exa get contents tool - fetch full text of URLs
 */
export const exaGetContentsTool = defineTool({
	name: 'exa_get_contents',
	description:
		'Fetch the full text content of URLs. Use this after exa_search to get the actual article text for summarization. Text is automatically truncated to prevent token overflow.',
	parameters: z.object({
		urls: z
			.array(z.string())
			.describe('Array of URLs to fetch content from (max 10)'),
		highlights: z
			.boolean()
			.optional()
			.default(false)
			.describe('Extract key highlights/quotes from the content'),
		maxCharsPerArticle: z
			.number()
			.optional()
			.default(DEFAULT_MAX_TEXT_CHARS)
			.describe(`Max characters per article (default ${DEFAULT_MAX_TEXT_CHARS}). Use lower values when fetching many articles.`),
	}),
	execute: async ({ urls, highlights, maxCharsPerArticle }) => {
		try {
			const apiKey = getExaApiKey();

			const limitedUrls = urls.slice(0, 10);

			const body: Record<string, unknown> = {
				urls: limitedUrls,
				text: true,
			};

			if (highlights) {
				body['highlights'] = {
					numSentences: 3,
					highlightsPerUrl: 3,
				};
			}

			const response = await fetch(`${EXA_API_BASE}/contents`, {
				method: 'POST',
				headers: {
					'x-api-key': apiKey,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const errorText = await response.text();
				return {
					success: false,
					error: `Exa API error: ${response.status} - ${errorText}`,
				};
			}

			const data = (await response.json()) as ExaContentsResponse;

			const maxChars = maxCharsPerArticle ?? DEFAULT_MAX_TEXT_CHARS;

			return {
				success: true,
				contentCount: data.results.length,
				contents: data.results.map((r) => {
					const { text, truncated, originalLength } = truncateText(r.text, maxChars);
					return {
						title: r.title,
						url: r.url,
						publishedDate: r.publishedDate,
						author: r.author,
						text,
						truncated,
						originalLength,
						highlights: r.highlights,
					};
				}),
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

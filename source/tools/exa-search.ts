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
		type: z
			.enum(['auto', 'fast', 'deep'])
			.optional()
			.default('auto')
			.describe(
				'Search type: "fast" for sub-350ms latency, "auto" (default) balances speed/quality, "deep" for agentic retrieval (~3.5s) with highest quality'
			),
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
		type,
		includeText,
	}) => {
		try {
			const apiKey = getExaApiKey();

			const body: Record<string, unknown> = {
				query,
				numResults: Math.min(numResults ?? 10, 100),
				useAutoprompt: true,
				type: type ?? 'auto',
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
		'Fetch the full text content of URLs. Use this to get complete article text for saving or detailed analysis.',
	parameters: z.object({
		urls: z
			.array(z.string())
			.describe('Array of URLs to fetch content from (max 10)'),
		highlights: z
			.boolean()
			.optional()
			.default(false)
			.describe('Extract key highlights/quotes from the content'),
	}),
	execute: async ({ urls, highlights }) => {
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

			return {
				success: true,
				contentCount: data.results.length,
				contents: data.results.map((r) => ({
					title: r.title,
					url: r.url,
					publishedDate: r.publishedDate,
					author: r.author,
					text: r.text,
					highlights: r.highlights,
				})),
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Research API - Agentic multi-step research
// ============================================================================

interface ExaResearchTaskResponse {
	id: string;
}

interface ExaResearchResult {
	id: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	output?: unknown;
	error?: string;
	costDollars?: number;
}

/**
 * Exa Research tool - agentic multi-step research with structured output
 */
export const exaResearchTool = defineTool({
	name: 'exa_research',
	description: `Perform deep, agentic web research using Exa's Research API. This spawns an AI research agent that:
1. Plans research steps based on your instructions
2. Searches the web multiple times, refining queries
3. Synthesizes findings into a structured report

Best for complex questions requiring multiple sources. Takes 20-40 seconds.
Returns either structured JSON (if outputSchema provided) or markdown report.

Use imperative verbs in instructions: "Compare", "List", "Summarize", "Find".`,
	parameters: z.object({
		instructions: z
			.string()
			.max(4096)
			.describe(
				'Natural language research instructions. Be explicit about objectives and constraints. Example: "Compare the top 3 JavaScript frameworks for building AI agents in 2025"'
			),
		outputSchema: z
			.record(z.unknown())
			.optional()
			.describe(
				'Optional JSON Schema for structured output. Max 8 root fields, max 5 levels deep. If not provided, returns markdown report.'
			),
		model: z
			.enum(['exa-research', 'exa-research-pro'])
			.optional()
			.default('exa-research')
			.describe(
				'"exa-research" (default) adapts compute to task difficulty. "exa-research-pro" uses max reasoning for complex tasks.'
			),
	}),
	execute: async ({ instructions, outputSchema, model }) => {
		try {
			const apiKey = getExaApiKey();

			// Create the research task
			const createBody: Record<string, unknown> = {
				instructions,
				model: model ?? 'exa-research',
			};

			if (outputSchema) {
				createBody['output'] = { schema: outputSchema };
			}

			const createResponse = await fetch(`${EXA_API_BASE}/research`, {
				method: 'POST',
				headers: {
					'x-api-key': apiKey,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(createBody),
			});

			if (!createResponse.ok) {
				const errorText = await createResponse.text();
				return {
					success: false,
					error: `Exa Research API error: ${createResponse.status} - ${errorText}`,
				};
			}

			const { id: taskId } = (await createResponse.json()) as ExaResearchTaskResponse;

			// Poll for completion (tasks take 20-40s typically)
			const maxWaitMs = 120000; // 2 minutes max
			const pollIntervalMs = 2000;
			const startTime = Date.now();

			while (Date.now() - startTime < maxWaitMs) {
				await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

				const pollResponse = await fetch(`${EXA_API_BASE}/research/${taskId}`, {
					method: 'GET',
					headers: {
						'x-api-key': apiKey,
					},
				});

				if (!pollResponse.ok) {
					const errorText = await pollResponse.text();
					return {
						success: false,
						error: `Exa Research poll error: ${pollResponse.status} - ${errorText}`,
					};
				}

				const result = (await pollResponse.json()) as ExaResearchResult;

				if (result.status === 'completed') {
					return {
						success: true,
						taskId,
						model: model ?? 'exa-research',
						durationMs: Date.now() - startTime,
						costDollars: result.costDollars,
						output: result.output,
					};
				}

				if (result.status === 'failed') {
					return {
						success: false,
						taskId,
						error: result.error ?? 'Research task failed',
					};
				}
			}

			return {
				success: false,
				taskId,
				error: 'Research task timed out after 2 minutes',
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Answer API - Direct Q&A with citations
// ============================================================================

interface ExaAnswerResponse {
	answer: string;
	citations: Array<{
		url: string;
		title?: string;
		publishedDate?: string;
		author?: string;
		text?: string;
	}>;
}

/**
 * Exa Answer tool - direct Q&A with grounded citations
 */
export const exaAnswerTool = defineTool({
	name: 'exa_answer',
	description: `Get a direct answer to a question, grounded in web search results with citations.
Faster than exa_research (~5-10s), best for factual questions with clear answers.
Returns the answer text plus source citations.`,
	parameters: z.object({
		query: z.string().describe('The question to answer'),
		outputSchema: z
			.record(z.unknown())
			.optional()
			.describe(
				'Optional JSON Schema for structured output. Example: { type: "object", properties: { answer: { type: "string" } } }'
			),
		includeDomains: z
			.array(z.string())
			.optional()
			.describe('Only use results from these domains'),
		excludeDomains: z
			.array(z.string())
			.optional()
			.describe('Exclude results from these domains'),
	}),
	execute: async ({ query, outputSchema, includeDomains, excludeDomains }) => {
		try {
			const apiKey = getExaApiKey();

			const body: Record<string, unknown> = {
				query,
				text: true,
			};

			if (outputSchema) {
				body['outputSchema'] = outputSchema;
			}

			if (includeDomains && includeDomains.length > 0) {
				body['includeDomains'] = includeDomains;
			}

			if (excludeDomains && excludeDomains.length > 0) {
				body['excludeDomains'] = excludeDomains;
			}

			const response = await fetch(`${EXA_API_BASE}/answer`, {
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
					error: `Exa Answer API error: ${response.status} - ${errorText}`,
				};
			}

			const data = (await response.json()) as ExaAnswerResponse;

			return {
				success: true,
				query,
				answer: data.answer,
				citationCount: data.citations.length,
				citations: data.citations.map((c) => ({
					url: c.url,
					title: c.title,
					publishedDate: c.publishedDate,
					author: c.author,
				})),
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Find Similar API - Find content similar to a URL
// ============================================================================

/**
 * Exa Find Similar tool - find content similar to a given URL
 */
export const exaFindSimilarTool = defineTool({
	name: 'exa_find_similar',
	description: `Find web content similar to a given URL. Useful for:
- Finding related articles on a topic
- Discovering competitors or alternatives
- Expanding research from a good starting point`,
	parameters: z.object({
		url: z.string().url().describe('The URL to find similar content for'),
		numResults: z
			.number()
			.optional()
			.default(10)
			.describe('Number of similar results to return (default 10, max 100)'),
		includeDomains: z
			.array(z.string())
			.optional()
			.describe('Only include results from these domains'),
		excludeDomains: z
			.array(z.string())
			.optional()
			.describe('Exclude results from these domains (e.g., exclude the source domain)'),
		excludeSourceDomain: z
			.boolean()
			.optional()
			.default(true)
			.describe('Exclude results from the same domain as the input URL (default true)'),
		includeText: z
			.boolean()
			.optional()
			.default(false)
			.describe('Include full text content in results'),
	}),
	execute: async ({
		url,
		numResults,
		includeDomains,
		excludeDomains,
		excludeSourceDomain,
		includeText,
	}) => {
		try {
			const apiKey = getExaApiKey();

			const body: Record<string, unknown> = {
				url,
				numResults: Math.min(numResults ?? 10, 100),
				excludeSourceDomain: excludeSourceDomain ?? true,
			};

			if (includeDomains && includeDomains.length > 0) {
				body['includeDomains'] = includeDomains;
			}

			if (excludeDomains && excludeDomains.length > 0) {
				body['excludeDomains'] = excludeDomains;
			}

			if (includeText) {
				body['contents'] = {
					text: true,
				};
			}

			const response = await fetch(`${EXA_API_BASE}/findSimilar`, {
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
					error: `Exa Find Similar API error: ${response.status} - ${errorText}`,
				};
			}

			const data = (await response.json()) as ExaSearchResponse;

			return {
				success: true,
				sourceUrl: url,
				resultCount: data.results.length,
				results: data.results.map((r) => {
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

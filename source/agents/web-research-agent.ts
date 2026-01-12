import { z } from 'zod';
import { createSubAgentTool } from '../core/sub-agent.js';
import { getModelsConfig } from '../core/project-config.js';
import { exaSearchTool, exaGetContentsTool } from '../tools/exa-search.js';

/**
 * Generic Web Research Sub-Agent
 *
 * Capabilities:
 * - Semantic web search via Exa
 * - Fetch full content from URLs
 * - Filter by domains (social, news, specific sites)
 * - Synthesize findings from multiple sources
 *
 * Used by: finance (market research), news (news aggregation), ask (general research)
 */
export function createWebResearchAgent() {
	const modelsConfig = getModelsConfig();

	return createSubAgentTool({
		name: 'web_research_agent',
		description: `Specialized agent for web research. Delegate to this agent when you need to:
- Fetch content from specific URLs/websites directly
- Search the web for information on any topic
- Find news articles, blog posts, or discussions
- Research companies, products, or trends
- Gather information from specific domains (Reddit, Twitter, news sites)
Returns a synthesized summary of findings with sources.`,
		systemPrompt: `You are a web research specialist. Your job is to find and synthesize information from the web.

## Tools Available

1. **exa_get_contents** - Fetch content from specific URLs directly (can fetch up to 10 URLs at once)
2. **exa_search** - Semantic web search to find relevant content

## Workflow

**For specific URLs** (e.g., "get news from https://omni.se"):
- Use exa_get_contents directly with the URLs
- Can fetch multiple URLs in one call (e.g., ["https://omni.se", "https://aftonbladet.se"])

**For topic searches** (e.g., "find news about AI"):
1. Use exa_search to find relevant content
   - Use includeDomains to filter to specific sites when appropriate
   - Use includeText=true for sites that block direct fetching (like Reddit)
2. For promising results without text, use exa_get_contents to get full article text

## Guidelines

- Always cite your sources with URLs
- Present multiple perspectives when available
- Distinguish between facts, opinions, and speculation
- Note the recency of information (check dates)
- Flag any conflicting information you find
- Summarize key points clearly`,
		model: modelsConfig.light,
		tools: [exaSearchTool, exaGetContentsTool],
		maxSteps: 8,
		inputSchema: z.object({
			query: z.string().describe('What to research or fetch from the web'),
			urls: z
				.array(z.string())
				.optional()
				.describe('Specific URLs to fetch directly (e.g., ["https://omni.se", "https://aftonbladet.se"])'),
			domains: z
				.array(z.string())
				.optional()
				.describe('Specific domains to search (e.g., ["reddit.com", "twitter.com"])'),
			context: z.string().optional().describe('Additional context for the research'),
		}),
		taskTransformer: (input) => {
			let task = `Research: ${input['query']}`;
			const urls = input['urls'] as string[] | undefined;
			if (urls && urls.length > 0) {
				task += `\n\nFetch these URLs directly using exa_get_contents: ${urls.join(', ')}`;
			}
			const domains = input['domains'] as string[] | undefined;
			if (domains && domains.length > 0) {
				task += `\nFocus on these domains: ${domains.join(', ')}`;
			}
			if (input['context']) {
				task += `\nContext: ${input['context']}`;
			}
			return task;
		},
		// Strip raw tool results to prevent token explosion - only return the synthesized summary
		resultTransformer: (response, toolCalls) => {
			// Only include tool call metadata, not the full results
			const toolSummary = toolCalls.map((tc) => ({
				tool: tc.name,
				duration: tc.duration,
				// For search: just show query and result count
				...(tc.name === 'exa_search' && {
					query: (tc.args as { query?: string }).query,
					resultCount: (tc.result as { resultCount?: number })?.resultCount,
				}),
				// For contents: just show URL count
				...(tc.name === 'exa_get_contents' && {
					urlCount: (tc.args as { urls?: string[] }).urls?.length,
				}),
			}));

			return {
				success: true,
				response,
				toolCallCount: toolCalls.length,
				toolSummary,
			};
		},
	});
}

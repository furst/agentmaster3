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
- Search the web for information on any topic
- Find news articles, blog posts, or discussions
- Research companies, products, or trends
- Gather information from specific domains (Reddit, Twitter, news sites)
Returns a synthesized summary of findings with sources.`,
		systemPrompt: `You are a web research specialist. Your job is to find and synthesize information from the web.

## Workflow

1. Use exa_search to find relevant content
   - Use includeDomains to filter to specific sites when appropriate
   - Use includeText=true for sites that block direct fetching (like Reddit)
2. For promising results, use exa_get_contents to get full article text
3. Synthesize findings into a clear, well-organized summary

## Search Tips

- For Reddit: include "r/subreddit" in query and use includeDomains=["reddit.com"]
- For Twitter/X: use includeDomains=["twitter.com", "x.com"]
- For news: use includeDomains with specific news sites
- Be specific in queries to get better results

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
			query: z.string().describe('What to research on the web'),
			domains: z
				.array(z.string())
				.optional()
				.describe('Specific domains to search (e.g., ["reddit.com", "twitter.com"])'),
			context: z.string().optional().describe('Additional context for the research'),
		}),
		taskTransformer: (input) => {
			let task = `Research: ${input['query']}`;
			const domains = input['domains'] as string[] | undefined;
			if (domains && domains.length > 0) {
				task += `\nFocus on these domains: ${domains.join(', ')}`;
			}
			if (input['context']) {
				task += `\nContext: ${input['context']}`;
			}
			return task;
		},
	});
}

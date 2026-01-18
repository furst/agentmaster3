import React, { useMemo } from "react";
import { z } from "zod";
import {
  createAgent,
  AgentShell,
  createToolsRecord,
  getModelsConfig,
  buildOrchestratorPrompt,
  buildMemoryPrompt as buildMemoryPromptSection,
  createTaskTool,
  // Framework tools
  saveMemoryTool,
  webSearchTool,
  webFetchTool,
  webAnswerTool,
  jinaReaderTool,
  readOnlyToolsRecord,
} from "@conductor/core";
import { getNewsConfig } from "../config/news-config.js";

export const options = z.object({
  prompt: z
    .string()
    .optional()
    .describe("Initial prompt or specific news request"),
});

type Props = {
  options: z.infer<typeof options>;
};

const AGENT_NAME = "news";

// Create the Task tool with read-only tools for sub-agents
const taskToolDef = createTaskTool(readOnlyToolsRecord);

function buildSystemPrompt(): string {
  const config = getNewsConfig();
  const memorySection = buildMemoryPromptSection(AGENT_NAME);

  const configuredUrls = config.sites.map(site =>
    site.startsWith('http') ? site : `https://${site}`
  );

  const sitesNote = configuredUrls.length > 0
    ? `Configured news sources:\n${configuredUrls.map(url => `- ${url}`).join('\n')}`
    : "";

  const interestsNote = config.interests.length > 0
    ? `User interests: ${config.interests.join(", ")}`
    : "";

  return buildOrchestratorPrompt({
    role: `You are a concise news assistant. Be brief and factual - no opinions, no verbose intros/outros.`,

    subAgents: [
      {
        name: "task (explore)",
        description: "Launches an explore sub-agent for news research",
        useCases: [
          "Search for news on specific topics",
          "Research multiple sources",
          "Deep dive into a story",
        ],
      },
    ],

    directTools: [
      {
        name: "fetch_page",
        description: "Fetch LIVE content from URLs (Jina) - use for news frontpages",
      },
      {
        name: "web_search",
        description: "Search the web for news on specific topics (Exa)",
      },
      {
        name: "web_fetch",
        description: "Fetch cached/indexed content from URLs (Exa) - use for URLs from search results",
      },
      {
        name: "web_answer",
        description: "Get quick answers about current events with citations",
      },
      {
        name: "save_memory",
        description: "Save user's news preferences and interests",
      },
    ],

    additionalInstructions: `${memorySection}

## News Sources

${sitesNote}

${interestsNote}

## How to Fetch News

**For general news requests** (e.g., "get me the news", "what's happening"):
- Use fetch_page for each configured news source (fetches LIVE content)
- Fetch sources ONE AT A TIME (sequential, not parallel)
- Example: First \`fetch_page({ url: "https://omni.se" })\`, then \`fetch_page({ url: "https://aftonbladet.se" })\`

**For topic-specific requests** (e.g., "news about AI"):
- Use web_search with the topic as query
- Or use web_answer for quick factual answers

**For fetching article content from search results**:
- Use web_fetch (Exa) for URLs returned by web_search - it has cached content
- Use fetch_page (Jina) if you need the absolute latest version

**For complex research** (multiple sources, synthesis needed):
- Use the task tool with subagent_type: "explore"

## Guidelines

- **No commentary** like "I'll fetch..." or "The most interesting story is..."
- Just present the news items directly
- Fetch sources sequentially, not in parallel

## Output Format

Present news using markdown formatting:

## Today's Headlines

**Story Title** - Brief one-line summary [source]

**Another Story** - Brief summary [source]

For topic-specific requests, use descriptive headers like "## Tech News" or "## Sports Headlines".

## Memory

Save to memory (agentName="${AGENT_NAME}") when user shares:
- Preferred news topics or interests
- Preferred sources or sites
- Reading preferences (summary length, format)`,
  });
}

export default function News({ options }: Props) {
  const modelsConfig = getModelsConfig();

  const agent = useMemo(() => {
    return createAgent({
      name: "news",
      systemPrompt: buildSystemPrompt(),
      model: modelsConfig.light,
      tools: createToolsRecord([
        saveMemoryTool,
        jinaReaderTool,
        webSearchTool,
        webFetchTool,
        webAnswerTool,
        taskToolDef,
      ]),
      maxIterations: 10,
    });
  }, [modelsConfig.light]);

  return (
    <AgentShell
      agent={agent}
      name="News"
      color="yellow"
      placeholder="What news would you like to see?"
      initialPrompt={options.prompt}
      welcomeMessage="I'll help you find and summarize the latest news. Ask me for news on any topic!"
    />
  );
}

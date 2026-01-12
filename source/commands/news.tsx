import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { createToolsRecord } from "../core/tools.js";
import { getNewsConfig, getModelsConfig } from "../core/project-config.js";
import { buildOrchestratorPrompt } from "../core/orchestrator-prompt.js";
import { buildMemoryPromptSection } from "../core/memory.js";

// Tools
import { saveMemoryTool } from "../tools/memory.js";

// Sub-agents
import { createWebResearchAgent } from "../agents/web-research-agent.js";

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
        name: "web_research_agent",
        description: "Fetches news from URLs and searches the web",
        useCases: [
          "Fetch headlines from specific news sites",
          "Search for news on specific topics",
          "Get content from URLs",
        ],
      },
    ],

    directTools: [
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
- Call web_research_agent with \`urls\` parameter containing the configured sources
- Example: \`urls: ["https://omni.se", "https://aftonbladet.se"]\`
- The agent will use exa_get_contents to fetch homepage content directly

**For topic-specific requests** (e.g., "news about AI"):
- Use web_research_agent with the topic as \`query\`
- Optionally filter by \`domains\` if searching specific sites

## Guidelines

- **No commentary** like "I'll fetch..." or "The most interesting story is..."
- Just present the news items directly
- When fetching multiple sources, use **parallel calls** (one per source)

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

  // Create sub-agent
  const webResearchAgent = useMemo(() => createWebResearchAgent(), []);

  const agent = useMemo(() => {
    return createAgent({
      name: "news",
      systemPrompt: buildSystemPrompt(),
      model: modelsConfig.light,
      tools: createToolsRecord([saveMemoryTool, webResearchAgent]),
      maxIterations: 10,
    });
  }, [modelsConfig.light, webResearchAgent]);

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

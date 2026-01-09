import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { createToolsRecord } from "../core/tools.js";
import { getNewsConfig, getModelsConfig } from "../core/project-config.js";
import { buildOrchestratorPrompt } from "../core/orchestrator-prompt.js";

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

function buildSystemPrompt(): string {
  const config = getNewsConfig();

  const sitesNote = config.sites.length > 0
    ? `Configured sources: ${config.sites.join(", ")}`
    : "";

  const interestsNote = config.interests.length > 0
    ? `User interests: ${config.interests.join(", ")}`
    : "";

  return buildOrchestratorPrompt({
    role: `You are a concise news assistant. Be brief and factual - no opinions, no verbose intros/outros.`,

    subAgents: [
      {
        name: "web_research_agent",
        description: "Searches the web and fetches news content",
        useCases: [
          "Find latest headlines",
          "Search news on specific topics",
          "Get articles from configured sources",
        ],
      },
    ],

    additionalInstructions: `## News-Specific Guidelines

- **No commentary** like "I'll fetch..." or "The most interesting story is..."
- Just present the news items directly
- When user asks for news on multiple topics, use **parallel calls** (one per topic)

${sitesNote}
${interestsNote}

## Output Format

Present news in a ContentCard:

:::news "Today's Headlines"
**Story Title** - Brief one-line summary [source]

**Another Story** - Brief summary [source]
:::

For topic-specific requests, use descriptive titles like "Tech News" or "Sports Headlines".`,
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
      tools: createToolsRecord([webResearchAgent]),
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

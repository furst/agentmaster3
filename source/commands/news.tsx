import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { createToolsRecord } from "../core/tools.js";
import { getNewsConfig } from "../core/project-config.js";
import { exaSearchTool, exaGetContentsTool } from "../tools/exa-search.js";

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

  const sitesSection =
    config.sites.length > 0
      ? `\n\nConfigured news sources (fetch these directly):
${config.sites.map((s) => `- https://${s}`).join("\n")}`
      : "";

  const interestsSection =
    config.interests.length > 0
      ? `\n\nUser's priority interests (focus on these topics):
${config.interests.map((i) => `- ${i}`).join("\n")}`
      : "";

  return `You are a concise news assistant. Be brief and factual - no opinions, no verbose intros/outros.

Workflow:
1. Use exa_search to find recent news (use includeDomains to filter by configured sites)
2. Use exa_get_contents to get full article text if needed
3. Present headlines using ContentCard format

Important:
- No commentary like "I'll fetch..." or "The most interesting story is..."
- Just present the news items directly
${sitesSection}${interestsSection}

## Output Format

Present news in a ContentCard for better visibility:

:::news "Today's Headlines"
**Story Title** - Brief one-line summary [source]

**Another Story** - Brief summary [source]

**Third Story** - Brief summary [source]
:::

For topic-specific requests, use a descriptive title like "Tech News" or "Sports Headlines".
Inside the card, use **bold** for headlines and keep summaries to one line each.`;
}

export default function News({ options }: Props) {
  const agent = useMemo(
    () =>
      createAgent({
        name: "news",
        systemPrompt: buildSystemPrompt(),
        tools: createToolsRecord([exaSearchTool, exaGetContentsTool]),
        maxIterations: 15,
      }),
    []
  );

  return (
    <AgentShell
      agent={agent}
      name="News"
      color="yellow"
      placeholder="What news would you like to see?"
      initialPrompt={options.prompt}
      welcomeMessage="I'll help you find and summarize the latest news. Ask me for news on any topic, or just say 'get news' to see articles from your configured sites."
    />
  );
}

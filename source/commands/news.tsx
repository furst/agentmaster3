import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { jinaReaderTool } from "../tools/jina-reader.js";
import { createToolsRecord } from "../core/tools.js";
import { getNewsConfig } from "../core/project-config.js";

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
1. Fetch the homepage of configured news sites (usually just ONE fetch is enough)
2. Summarize the headlines you find - the homepage already has article titles and short descriptions
3. ONLY fetch individual articles if required(lack of information in the summary)

Important:
- The homepage usually contains enough info for a news summary - don't over-fetch
- No commentary like "I'll fetch..." or "The most interesting story is..."
- Just list the news items directly
${sitesSection}${interestsSection}

Output format (be concise):
**Headline** - one line summary. [link]`;
}

export default function News({ options }: Props) {
  const agent = useMemo(
    () =>
      createAgent({
        name: "news",
        systemPrompt: buildSystemPrompt(),
        tools: createToolsRecord([jinaReaderTool]),
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

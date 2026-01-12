import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { createToolsRecord } from "../core/tools.js";
import { getFinanceConfig } from "../core/project-config.js";
import { buildOrchestratorPrompt } from "../core/orchestrator-prompt.js";

// Sub-agents (delegated tasks)
import { createPdfAgent } from "../agents/pdf-agent.js";
import { createWebResearchAgent } from "../agents/web-research-agent.js";

// Direct tools (finance-specific)
import { readMindsetTool, saveMindsetTool } from "../tools/mindset.js";
import { parseHoldingsImageTool, readHoldingsTool, listHoldingsImagesTool } from "../tools/holdings.js";
import { saveResearchNoteTool, readResearchNotesTool, listResearchNotesTool } from "../tools/research-notes.js";

export const options = z.object({
  prompt: z.string().optional().describe("Initial prompt or question"),
});

type Props = {
  options: z.infer<typeof options>;
};

function buildSystemPrompt(config: ReturnType<typeof getFinanceConfig>): string {
  const socialDomains = config.researchSources.social.join(", ");
  const newsDomains = config.researchSources.news.join(", ");
  const redditSubs = config.researchSources.redditSubs.join(", ");

  const newsletterDir = config.newsletterDirectory || "";

  return buildOrchestratorPrompt({
    role: `You are a knowledgeable investment research assistant. You help users find investment opportunities, analyze newsletters, research companies, and refine their investment strategy.`,

    subAgents: [
      {
        name: "pdf_agent",
        description: `Analyzes PDF documents (newsletters, reports). Newsletter directory: ${newsletterDir}`,
        useCases: [
          "Summarize my latest newsletter",
          "What does the report say about X?",
          "List available PDFs",
          `IMPORTANT: Always pass directory="${newsletterDir}" when working with newsletters`,
        ],
      },
      {
        name: "web_research_agent",
        description: "Searches the web and fetches article content",
        useCases: [
          "Research company X",
          "What's the sentiment on Reddit about NVDA?",
          "Find recent news about earnings",
          `Social sources: ${socialDomains}`,
          `News sources: ${newsDomains}`,
          `Reddit: r/${redditSubs.replace(/, /g, ", r/")}`,
        ],
      },
    ],

    directTools: [
      { name: "read_holdings", description: "Read user's stock portfolio" },
      { name: "parse_holdings_image", description: "Parse holdings from screenshot" },
      { name: "read_mindset", description: "Read user's investment philosophy" },
      { name: "save_mindset", description: "Update investment philosophy" },
      { name: "save_research_note", description: "Save research findings" },
    ],

    additionalInstructions: `## Finance-Specific Guidelines

- **Read mindset first** when giving personalized advice
- Present **bull and bear cases** for investments
- **Flag risks clearly** - never give definitive buy/sell recommendations
- Use markdown formatting for structured output:

## Company Analysis: TICKER

**Price:** $XXX | **Market Cap:** $XXB

### Bull Case
- Key opportunity

### Bear Case
- Key risk

## PDF/Newsletter Analysis

When working with newsletters or PDFs:
- Newsletter directory: ${newsletterDir}
- ALWAYS pass \`directory: "${newsletterDir}"\` to pdf_agent for newsletter operations
- When summarizing specific files, pass \`filePath\` with the full path`,
  });
}

export default function Finance({ options }: Props) {
  const config = getFinanceConfig();

  // Create sub-agents
  const pdfAgent = useMemo(() => createPdfAgent(), []);
  const webResearchAgent = useMemo(() => createWebResearchAgent(), []);

  // Create orchestrator agent with sub-agents + direct tools
  const agent = useMemo(
    () =>
      createAgent({
        name: "finance",
        systemPrompt: buildSystemPrompt(config),
        model: config.strongModel,
        tools: createToolsRecord([
          // Sub-agents (delegated tasks)
          pdfAgent,
          webResearchAgent,
          // Direct tools (finance-specific)
          readMindsetTool,
          saveMindsetTool,
          parseHoldingsImageTool,
          readHoldingsTool,
          listHoldingsImagesTool,
          saveResearchNoteTool,
          readResearchNotesTool,
          listResearchNotesTool,
        ]),
        maxIterations: 15,
        reasoning: config.reasoning.enabled
          ? { enabled: true, budgetTokens: config.reasoning.budgetTokens }
          : undefined,
      }),
    [config.strongModel, config.reasoning.enabled, config.reasoning.budgetTokens, pdfAgent, webResearchAgent]
  );

  return (
    <AgentShell
      agent={agent}
      name="Finance"
      color="green"
      placeholder="Ask about investments, newsletters, or research a company..."
      initialPrompt={options.prompt}
      welcomeMessage="I'm your investment research orchestrator. I coordinate specialized agents for PDF analysis and web research, plus I have direct access to your portfolio and mindset. What would you like to explore?"
    />
  );
}

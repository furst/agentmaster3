import React, { useMemo } from "react";
import { z } from "zod";
import {
  createAgent,
  AgentShell,
  createToolsRecord,
  buildOrchestratorPrompt,
  buildMemoryPrompt as buildMemoryPromptSection,
  createTaskTool,
  // Framework tools
  saveMemoryTool,
  webFetchTool,
  webSearchTool,
  webResearchTool,
  webAnswerTool,
  listPdfsTool,
  readPdfTool,
  readOnlyToolsRecord,
} from "@conductor/core";

// Domain config
import { getFinanceConfig } from "../config/finance-config.js";

// Finance-specific tools
import { readMindsetTool, saveMindsetTool } from "../tools/mindset.js";
import { parseHoldingsImageTool, readHoldingsTool } from "../tools/holdings.js";
import {
  financialMetricsSnapshotTool,
  financialStatementsTool,
  stockPricesTool,
  insiderTradesTool,
  institutionalOwnershipTool,
  earningsPressReleasesTool,
  secFilingItemsTool,
} from "../tools/financial-datasets.js";

export const options = z.object({
  prompt: z.string().optional().describe("Initial prompt or question"),
});

type Props = {
  options: z.infer<typeof options>;
};

const AGENT_NAME = "finance";

// Create the Task tool with read-only tools for sub-agents
const taskToolDef = createTaskTool(readOnlyToolsRecord);

function buildSystemPrompt(config: ReturnType<typeof getFinanceConfig>): string {
  const memorySection = buildMemoryPromptSection(AGENT_NAME);
  const socialDomains = config.researchSources.social.join(", ");
  const newsDomains = config.researchSources.news.join(", ");
  const redditSubs = config.researchSources.redditSubs.join(", ");

  const newsletterDir = config.newsletterDirectory || "";

  return buildOrchestratorPrompt({
    role: `You are a knowledgeable investment research assistant. You help users find investment opportunities, analyze newsletters, research companies, and refine their investment strategy.`,

    subAgents: [
      {
        name: "task (explore)",
        description: "Launches an explore sub-agent for research",
        useCases: [
          "Research company X across multiple sources",
          "Deep dive into a topic requiring multiple searches",
          "Complex web research synthesis",
        ],
      },
    ],

    directTools: [
      { name: "web_search", description: "Search the web for news, sentiment, company info" },
      { name: "web_fetch", description: "Fetch full content from URLs" },
      { name: "web_research", description: "Deep agentic research on a topic" },
      { name: "web_answer", description: "Quick Q&A with citations" },
      { name: "list_pdfs", description: `List PDFs (newsletter directory: ${newsletterDir})` },
      { name: "read_pdf", description: "Read and summarize PDF content" },
      { name: "read_holdings", description: "Read user's stock portfolio" },
      { name: "parse_holdings_image", description: "Parse holdings from screenshot" },
      { name: "read_mindset", description: "Read user's investment philosophy" },
      { name: "save_mindset", description: "Update investment philosophy" },
      { name: "save_memory", description: "Save general context and preferences" },
      // Financial data API tools (US stocks only)
      { name: "financial_metrics_snapshot", description: "Get real-time valuation ratios, margins, returns (US stocks)" },
      { name: "financial_statements", description: "Get income/balance/cash flow statements (US stocks)" },
      { name: "stock_prices", description: "Get historical OHLCV price data (US stocks)" },
      { name: "insider_trades", description: "Track insider buying/selling activity (US stocks)" },
      { name: "institutional_ownership", description: "See major institutional holders (US stocks)" },
      { name: "earnings_press_releases", description: "Get earnings announcements full text (US stocks)" },
      { name: "sec_filing_items", description: "Extract sections from 10-K/10-Q filings (US stocks)" },
    ],

    additionalInstructions: `${memorySection}

## Finance-Specific Guidelines

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
- Use \`list_pdfs\` with directory="${newsletterDir}" to find newsletters
- Use \`read_pdf\` with the full path to analyze specific files

## Research Sources

Social: ${socialDomains}
News: ${newsDomains}
Reddit: r/${redditSubs.replace(/, /g, ", r/")}

## Memory

Save to memory (agentName="${AGENT_NAME}") for general context:
- Watchlist stocks or sectors of interest
- Analysis preferences (depth, focus areas)
- Current market thesis or outlook
Note: Use save_mindset for core investment philosophy; use save_memory for transient context.`,
  });
}

export default function Finance({ options }: Props) {
  const config = getFinanceConfig();

  // Create agent with direct tools + task tool for sub-agents
  const agent = useMemo(
    () =>
      createAgent({
        name: "finance",
        systemPrompt: buildSystemPrompt(config),
        model: config.strongModel,
        tools: createToolsRecord([
          // Web tools (direct)
          webFetchTool,
          webSearchTool,
          webResearchTool,
          webAnswerTool,
          // PDF tools (direct)
          listPdfsTool,
          readPdfTool,
          // Finance-specific tools
          readMindsetTool,
          saveMindsetTool,
          parseHoldingsImageTool,
          readHoldingsTool,
          saveMemoryTool,
          // Financial data API tools (US stocks only)
          financialMetricsSnapshotTool,
          financialStatementsTool,
          stockPricesTool,
          insiderTradesTool,
          institutionalOwnershipTool,
          earningsPressReleasesTool,
          secFilingItemsTool,
          // Task tool for sub-agents
          taskToolDef,
        ]),
        maxIterations: 15,
        reasoning: config.reasoning.enabled
          ? { enabled: true, budgetTokens: config.reasoning.budgetTokens }
          : undefined,
      }),
    [config.strongModel, config.reasoning.enabled, config.reasoning.budgetTokens]
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

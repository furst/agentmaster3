import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { createToolsRecord } from "../core/tools.js";
import { getFinanceConfig } from "../core/project-config.js";

// Tools
import { listPdfsTool } from "../tools/list-pdfs.js";
import { readPdfTool } from "../tools/read-pdf.js";
import { readMindsetTool, saveMindsetTool } from "../tools/mindset.js";
import { exaSearchTool, exaGetContentsTool } from "../tools/exa-search.js";
import { parseHoldingsImageTool, readHoldingsTool, listHoldingsImagesTool } from "../tools/holdings.js";

export const options = z.object({
  prompt: z.string().optional().describe("Initial prompt or question"),
});

type Props = {
  options: z.infer<typeof options>;
};

function buildSystemPrompt(): string {
  const config = getFinanceConfig();

  const newsletterSection = config.newsletterDirectory
    ? `\n\n**Newsletter Directory**: ${config.newsletterDirectory}
Use list_pdfs to see available newsletters, then read_pdf to analyze them.`
    : "";

  const socialDomains = config.researchSources.social.join(", ");
  const newsDomains = config.researchSources.news.join(", ");
  const redditSubs = config.researchSources.redditSubs.join(", ");

  return `You are a knowledgeable investment research assistant. Help the user find investment opportunities, analyze newsletters, research companies, and refine their investment strategy.

## Your Capabilities

1. **Portfolio Analysis**: Read the user's current holdings from parsed screenshots. Parse new holdings screenshots when uploaded.
2. **Newsletter Analysis**: Read and summarize PDF investment newsletters from the user's collection.
3. **Social Research**: Search Reddit (r/${redditSubs.replace(/, /g, ", r/")}), Twitter/X, and HackerNews for investment discussions.
4. **Financial News**: Search ${newsDomains} for professional analysis and market news.
5. **Company Research**: Research companies using web search, fetch investor relations pages, earnings reports, and news.
6. **Investment Mindset**: Help the user develop and maintain their investment philosophy and decision-making framework.

## Guidelines

- Always read the user's mindset file first when giving personalized advice (use read_mindset)
- Be factual and cite sources when discussing specific investments
- Present multiple perspectives (bull/bear cases) for investment ideas
- Flag risks and uncertainties clearly
- Never give definitive "buy" or "sell" recommendations - provide analysis for informed decisions
- For social research, use exa_search with includeDomains parameter
- For Reddit specifically: use exa_search with includeDomains=["reddit.com"] AND includeText=true (Reddit blocks direct fetching, so get content from Exa's index)
- Include subreddit in your query (e.g., "r/investing NVDA")

## Tools Available

- **read_holdings**: Read the user's current stock holdings from saved data
- **parse_holdings_image**: Parse a new holdings screenshot (uses AI vision). Call when user uploads a new screenshot.
- **list_holdings_images**: List available holdings screenshots
- **list_pdfs**: List available PDF newsletters in a directory
- **read_pdf**: Read and extract/summarize text from PDF files (uses a light AI model for extraction)
- **read_mindset**: Read the user's investment philosophy
- **save_mindset**: Update the user's investment philosophy
- **exa_search**: Search the web (filter by domain for specific sources)
- **exa_get_contents**: Fetch full article/thread content from URLs

## Research Sources

**Social/Forums**: ${socialDomains}
**Financial News**: ${newsDomains}
**Reddit Subreddits**: r/${redditSubs.replace(/, /g, ", r/")}
${newsletterSection}

## Output Style

- Be concise but thorough
- Use bullet points for clarity
- Include source links when available
- Structure longer analyses with headers
- When presenting investment ideas, always include both opportunities and risks

## Content Formatting

Use ContentCard markers to highlight important findings and summaries:

:::finance "Company Analysis: TICKER"
Current Price: $XXX
Market Cap: $XXB

## Bull Case
- Key opportunity 1
- Key opportunity 2

## Bear Case
- Key risk 1
- Key risk 2

## Sources
- [Source 1](url)
:::

Available card types:
- \`finance\` - For investment analysis, portfolio summaries, company research
- \`summary\` - For newsletter summaries and overviews
- \`warning\` - For risk warnings and cautions
- \`news\` - For market news roundups

Inside cards use \`Key: Value\` for metrics (auto-highlighted), \`## Headers\` for sections, and \`**bold**\` for emphasis.`;
}

export default function Finance({ options }: Props) {
  const config = getFinanceConfig();

  const agent = useMemo(
    () =>
      createAgent({
        name: "finance",
        systemPrompt: buildSystemPrompt(),
        tools: createToolsRecord([
          listPdfsTool,
          readPdfTool,
          readMindsetTool,
          saveMindsetTool,
          exaSearchTool,
          exaGetContentsTool,
          parseHoldingsImageTool,
          readHoldingsTool,
          listHoldingsImagesTool,
        ]),
        maxIterations: 15,
        reasoning: config.reasoning.enabled
          ? { enabled: true, budgetTokens: config.reasoning.budgetTokens }
          : undefined,
      }),
    [config.reasoning.enabled, config.reasoning.budgetTokens]
  );

  return (
    <AgentShell
      agent={agent}
      name="Finance"
      color="green"
      placeholder="Ask about investments, newsletters, or research a company..."
      initialPrompt={options.prompt}
      welcomeMessage="I'm your investment research assistant. I can analyze newsletters, search Reddit/Twitter/HackerNews for advice, check financial news, research companies, and help refine your investment mindset. What would you like to explore?"
    />
  );
}

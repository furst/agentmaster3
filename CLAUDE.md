# Conductor CLI

TypeScript CLI for AI agents using Ink (React for CLIs) and Vercel AI SDK.

## Quick Reference

```bash
npm run build          # Build all packages
npm run dev            # Watch mode
npm start              # Run CLI (node apps/agents/dist/cli.js)
node apps/agents/dist/cli.js ask   # Run ask agent
node apps/agents/dist/cli.js news  # Run news agent
node apps/agents/dist/cli.js bg3   # Run BG3 assistant
```

## Monorepo Structure

```
conductor/
├── packages/
│   └── core/                    # Framework package (@conductor/core)
│       └── src/
│           ├── core/            # Agent engine, LLM, sessions, config
│           ├── components/      # UI components (AgentShell, Timeline, etc.)
│           ├── tools/           # General-purpose tools
│           └── utils/           # Formatting, streaming, model utilities
└── apps/
    └── agents/                  # Personal agents (conductor-agents)
        └── source/
            ├── cli.tsx          # CLI entry point
            ├── commands/        # ask, news, finance, bg3
            ├── tools/           # Finance-specific tools
            └── config/          # Domain-specific config schemas
```

## Adding an Agent

Create `apps/agents/source/commands/myagent.tsx`:

```tsx
import {
  createAgent,
  AgentShell,
  createToolsRecord,
  readFileTool,
  webSearchTool,
} from "@conductor/core";

export default function MyAgent({ options }) {
  const agent = useMemo(() => createAgent({
    name: "myagent",
    systemPrompt: "You are a specialized assistant...",
    tools: createToolsRecord([readFileTool, webSearchTool]),
  }), []);

  return <AgentShell agent={agent} name="My Agent" initialPrompt={options.prompt} />;
}
```

## Adding a Tool

### Framework Tool (packages/core/src/tools/)

```typescript
import { defineTool } from '../core/tools.js';
import { z } from 'zod';

export const myTool = defineTool({
  name: "my_tool",
  description: "Description for the LLM",
  parameters: z.object({ input: z.string() }),
  execute: async ({ input }) => ({ result: "success", data: input }),
});
```

Then export from `packages/core/src/tools/index.ts`.

### Domain Tool (apps/agents/source/tools/)

```typescript
import { defineTool } from '@conductor/core';
import { z } from 'zod';

export const myDomainTool = defineTool({
  name: "my_domain_tool",
  description: "Finance-specific tool",
  parameters: z.object({ ticker: z.string() }),
  execute: async ({ ticker }) => ({ success: true, data: ticker }),
});
```

## Available Tools

### Framework Tools (packages/core/src/tools/)

| Tool | File | Description |
|------|------|-------------|
| `web_search` | web.ts | Search web via Exa API |
| `web_fetch` | web.ts | Fetch content from URLs (cached) |
| `web_research` | web.ts | Deep agentic research (20-40s) |
| `web_answer` | web.ts | Q&A with citations (5-10s) |
| `fetch_page` | jina-reader.ts | Live webpage fetch via Jina |
| `read_file` | read-file.ts | Read local files |
| `list_pdfs` | list-pdfs.ts | List PDFs in directory |
| `read_pdf` | read-pdf.ts | Extract/summarize PDF content |
| `list_vault_notes` | obsidian-vault.ts | List Obsidian notes |
| `read_vault_note` | obsidian-vault.ts | Read vault note |
| `write_vault_note` | obsidian-vault.ts | Write vault note |
| `search_vault` | obsidian-vault.ts | Fuzzy search vault |
| `save_memory` | memory.ts | Save per-agent memory |
| `ask_user_question` | ask-user-question.ts | Interactive user question |
| `enter_plan_mode` | plan-mode.ts | Switch to planning mode |
| `exit_plan_mode` | plan-mode.ts | Exit planning mode |
| `create_todos` | session-todo.ts | Create session todo list |
| `update_todo` | session-todo.ts | Update todo status |
| `get_todos` | session-todo.ts | Get current todos |

### Finance Tools (apps/agents/source/tools/)

| Tool | File | Description |
|------|------|-------------|
| `financial_metrics_snapshot` | financial-datasets.ts | Real-time valuation ratios |
| `financial_statements` | financial-datasets.ts | Income/balance/cash flow |
| `stock_prices` | financial-datasets.ts | Historical OHLCV data |
| `insider_trades` | financial-datasets.ts | Insider activity |
| `institutional_ownership` | financial-datasets.ts | Major holders |
| `earnings_press_releases` | financial-datasets.ts | Earnings releases |
| `sec_filing_items` | financial-datasets.ts | 10-K/10-Q sections |
| `read_mindset` | mindset.ts | Read investment philosophy |
| `save_mindset` | mindset.ts | Save investment philosophy |
| `parse_holdings_image` | holdings.ts | Parse holdings screenshot (Gemini) |
| `read_holdings` | holdings.ts | Read saved holdings |

**Environment variables:** `ANTHROPIC_API_KEY`, `EXA_API_KEY`, `FINANCIAL_DATASETS_API_KEY`

## Core APIs

### createAgent(config)

```typescript
import { createAgent, createToolsRecord, readFileTool } from '@conductor/core';

const agent = createAgent({
  name: "myagent",
  systemPrompt: "...",
  tools: createToolsRecord([readFileTool]),
  maxIterations: 10,
  model: "claude-sonnet-4-20250514",
  hooks: { onBeforeToolCall, onAfterToolCall, onStart, onFinish },
});

// Methods
agent.sendMessage(prompt, onEvent);
agent.getStats();
agent.exportSession();
agent.importSession(session);
agent.reset();
agent.cancel();
```

### useAgentTimeline(agent)

```typescript
import { useAgentTimeline } from '@conductor/core';

const {
  timeline,          // TimelineEntry[] - chronological entries
  streamingEntry,    // Current streaming text
  messages, isLoading, error, stats,
  sendMessage, cancel, reset,
} = useAgentTimeline(agent);
```

### defineTool(definition)

```typescript
import { defineTool } from '@conductor/core';

const tool = defineTool({
  name: 'tool_name',
  description: 'What this tool does',
  parameters: z.object({ ... }),
  execute: async (params, context) => { ... },
});
```

## Configuration

### Getting Started

1. Copy config files from examples:
   ```bash
   cp config.example.json config.json
   cp apps/agents/config.example.json apps/agents/config.json
   ```
2. Configure your models in `config.json` (required)
3. Customize agent settings in `apps/agents/config.json`
4. Both config files are gitignored - your personal settings stay local

### Core Config (`./config.example.json`)

Framework settings used by all agents:

```json
{
  "models": {
    "light": "google:gemini-3-flash-preview",
    "strong": "google:gemini-3-pro-preview",
    "reasoning": { "enabled": false, "budgetTokens": 10000 }
  },
  "memory": { "directory": "./data/memory" },
  "obsidian": { "vaultPath": "/path/to/vault" }
}
```

**Note:** `models.light` and `models.strong` are required - they have no defaults.

### Agent Config (`apps/agents/config.json`)

Domain-specific settings for personal agents. This config is automatically merged with the root config (app config takes precedence):

```json
{
  "news": {
    "sites": ["news.ycombinator.com", "techcrunch.com"],
    "interests": ["technology", "AI"],
    "defaultCount": 5
  },
  "finance": {
    "newsletterDirectory": "./newsletters",
    "mindsetPath": "./investment-mindset.md",
    "holdingsDirectory": "./data/holdings",
    "researchSources": { "social": [...], "news": [...], "redditSubs": [...] }
  }
}
```

**Config merging:** Root `config.json` + `apps/agents/config.json` are deep-merged at runtime. Put core settings (models, obsidian, memory) in root config, and agent-specific settings (news, finance) in app config.

### User Config (`~/.config/conductor/config.json`)

```json
{
  "anthropicApiKey": "sk-ant-...",
  "defaultModel": "claude-sonnet-4-20250514"
}
```

### Config Plugin System

Apps can register custom config sections and additional config files:

```typescript
import { registerConfigSection, getConfigSection, registerAppConfig } from '@conductor/core';
import { z } from 'zod';

// Register an app-specific config file (merged with root config)
registerAppConfig('/path/to/app/config.json');

// Register a custom config section schema
const MyConfigSchema = z.object({
  apiKey: z.string(),
  enabled: z.boolean().default(true),
});

registerConfigSection('myfeature', MyConfigSchema);

// Later
const config = getConfigSection<z.infer<typeof MyConfigSchema>>('myfeature');
```

## Session Management

Sessions auto-save on exit. Use `/resume` inside any agent to continue previous conversations.

```typescript
import { saveSession, loadSession, listSessions } from '@conductor/core';

// Programmatic
const session = agent.exportSession();
agent.importSession(session);
```

## Sub-Agents via Task Tool

```typescript
import { createTaskTool, readOnlyToolsRecord } from '@conductor/core';

const taskTool = createTaskTool(readOnlyToolsRecord);
// Params: { subagent_type: 'explore'|'plan', prompt, description, model?, max_turns? }
```

## Hooks

### Agent Hooks

```typescript
createAgent({
  hooks: {
    onBeforeToolCall: async (toolName, input, context) => {
      return { action: 'allow' };  // or 'deny' with denyReason, or 'modify' with modifiedInput
    },
    onAfterToolCall: async (toolName, input, result, context) => {
      return {};  // or { modifiedResult }
    },
  },
});
```

### Obsidian Hooks

Customize how vault notes are tagged and formatted:

```typescript
import { registerObsidianHooks } from '@conductor/core';

// Register at app startup
registerObsidianHooks({
  // Custom tag inference based on content/path
  tagInference: (content: string, path: string) => {
    const tags: string[] = [];
    if (path.includes('recipe')) tags.push('cooking/recipe');
    return tags;
  },
  // Custom frontmatter format
  frontmatterGenerator: (tags: string[], type?: string) => {
    return `---\ntags: [${tags.join(', ')}]\n---\n\n`;
  },
});
```

Default behavior (no hooks): minimal frontmatter with no automatic tags.

## Package Development

### Building

```bash
# Build core package
npm run build --workspace=@conductor/core

# Build agents app
npm run build --workspace=conductor-agents

# Build all
npm run build
```

### Adding to Framework

When adding to packages/core:
1. Add file to appropriate directory (core/, tools/, components/)
2. Export from the directory's index.ts
3. Ensure it's re-exported from src/index.ts

### Adding Personal Tools

When adding to apps/agents:
1. Add tool file to source/tools/
2. Import from '@conductor/core' for defineTool
3. Import from '../config/' for domain-specific config
4. Export from source/tools/index.ts

## Notes

- Agents should have few, focused tools
- Tool display: `⠋ fetch_page url="..."` → `✓ fetch_page (1.2s) → 150 lines`
- Config path: `~/.config/conductor/` (renamed from agentmaster)
- Always update CLAUDE.md when adding tools/agents/configs

# Conductor

TypeScript CLI framework for building AI agents using [Ink](https://github.com/vadimdemedes/ink) (React for CLIs) and [Vercel AI SDK](https://sdk.vercel.ai/).

## Features

- **Agent Framework** - Create conversational AI agents with tools, memory, and session management
- **React-based CLI** - Build rich terminal interfaces using Ink components
- **Tool System** - Define tools with Zod schemas and async execution
- **Session Persistence** - Auto-save and resume conversations
- **Plan Mode** - Structured planning workflow for complex tasks
- **Sub-agents** - Spawn specialized agents for research tasks
- **Obsidian Integration** - Read/write notes to Obsidian vaults

## Quick Start

1. Clone the repository
2. Copy config files from examples:
   ```bash
   cp config.example.json config.json
   cp apps/agents/config.example.json apps/agents/config.json
   ```
3. Configure your models in `config.json` (required):
   ```json
   {
     "models": {
       "light": "google:gemini-3-flash-preview",
       "strong": "google:gemini-3-pro-preview"
     }
   }
   ```
4. Customize agent settings in `apps/agents/config.json` (news sites, finance paths, etc.)
5. Set your API keys as environment variables
6. Build and run:
   ```bash
   npm install
   npm run build
   npm start
   ```

## Project Structure

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
            ├── commands/        # Agent definitions (ask, news, finance, bg3)
            ├── tools/           # Domain-specific tools
            └── config/          # Domain-specific config schemas
```

## Configuration

### Core Config (`./config.example.json`)

Framework settings used by all agents:

```json
{
  "models": {
    "light": "provider:model-name",
    "strong": "provider:model-name",
    "reasoning": { "enabled": false, "budgetTokens": 10000 }
  },
  "memory": { "directory": "./data/memory" },
  "obsidian": { "vaultPath": "/path/to/vault" }
}
```

**Note:** `models.light` and `models.strong` are required - they have no defaults.

### Agent Config (`apps/agents/config.json`)

Domain-specific settings for personal agents. Automatically merged with root config:

```json
{
  "news": {
    "sites": ["news.ycombinator.com", "techcrunch.com"],
    "interests": ["technology", "AI"]
  },
  "finance": {
    "newsletterDirectory": "./newsletters",
    "mindsetPath": "./investment-mindset.md"
  }
}
```

**Config merging:** Root config + app config are deep-merged at runtime (app config takes precedence).

### User Config (`~/.config/conductor/config.json`)

```json
{
  "anthropicApiKey": "sk-ant-...",
  "defaultModel": "claude-sonnet-4-20250514"
}
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key
- `EXA_API_KEY` - Exa search API key (for web search tools)
- `FINANCIAL_DATASETS_API_KEY` - Financial Datasets API key (for finance agent)

## Creating an Agent

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

## Creating a Tool

```typescript
import { defineTool } from '@conductor/core';
import { z } from 'zod';

export const myTool = defineTool({
  name: "my_tool",
  description: "Description for the LLM",
  parameters: z.object({ input: z.string() }),
  execute: async ({ input }) => ({ result: "success", data: input }),
});
```

## Obsidian Hooks

Customize how vault notes are tagged and formatted:

```typescript
import { registerObsidianHooks } from '@conductor/core';

registerObsidianHooks({
  tagInference: (content: string, path: string) => {
    const tags: string[] = [];
    if (path.includes('recipe')) tags.push('cooking/recipe');
    return tags;
  },
  frontmatterGenerator: (tags: string[], type?: string) => {
    return `---\ntags: [${tags.join(', ')}]\n---\n\n`;
  },
});
```

## Development

```bash
npm run build          # Build all packages
npm run dev            # Watch mode
npm start              # Run CLI
```

See [CLAUDE.md](./CLAUDE.md) for detailed development documentation.

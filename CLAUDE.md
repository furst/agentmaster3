# Agentmaster CLI

A TypeScript CLI foundation for building multiple specialized AI agents using Ink (React for CLIs) and Vercel AI SDK 6.

## Architecture

- **Ink + Pastel** - React-based CLI framework with file-based routing
- **Vercel AI SDK 6** - AI/LLM integration with streaming and tool support
- **@inkjs/ui** - Pre-built UI components (TextInput, Spinner, etc.)
- **Zod** - Schema validation for configs and tool parameters

## Directory Structure

```
source/
├── commands/           # Pastel command files (file-based routing)
│   ├── index.tsx       # Default command (help)
│   ├── ask.tsx         # General assistant agent
│   └── news.tsx        # News aggregation agent
├── core/
│   ├── config.ts       # User config (~/.config/agentmaster/)
│   ├── project-config.ts # Project config (./config.json)
│   ├── llm.ts          # Anthropic client wrapper
│   ├── tools.ts        # Tool definition helpers
│   └── agent.ts        # Agent factory + useAgent hook
├── components/
│   ├── AgentShell.tsx  # Main agent UI wrapper
│   ├── Message.tsx     # Message rendering
│   ├── ToolCall.tsx    # Tool call visualization (Claude Code-inspired)
│   ├── Timeline.tsx    # Status timeline
│   ├── Spinner.tsx     # Loading indicators
│   └── Error.tsx       # Error displays
├── tools/
│   ├── read-file.ts    # File reading tool
│   ├── web-search.ts   # Web search (stub)
│   ├── jina-reader.ts  # Fetch URLs as clean markdown (no API key)
│   ├── exa-search.ts   # Exa semantic search + contents (requires EXA_API_KEY)
│   └── index.ts        # Tool registry
└── utils/
    ├── format.ts       # Text formatting helpers
    └── streaming.ts    # Stream processing utilities
```

## Adding a New Agent

1. Create a new command file in `source/commands/`:

```tsx
// source/commands/myagent.tsx
import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { readFileTool } from "../tools/read-file.js";
import { createToolsRecord } from "../core/tools.js";

export const options = z.object({
  prompt: z.string().optional().describe("Initial prompt"),
});

export default function MyAgent({
  options,
}: {
  options: z.infer<typeof options>;
}) {
  const agent = useMemo(
    () =>
      createAgent({
        name: "myagent",
        systemPrompt: "You are a specialized assistant...",
        tools: createToolsRecord([readFileTool]),
        maxIterations: 5,
      }),
    []
  );

  return (
    <AgentShell
      agent={agent}
      name="My Agent"
      color="green"
      initialPrompt={options.prompt}
    />
  );
}
```

2. Run with: `agentmaster3 myagent`

## Adding a New Tool

1. Create a tool file in `source/tools/`:

```typescript
// source/tools/my-tool.ts
import { z } from "zod";
import { defineTool } from "../core/tools.js";

export const myTool = defineTool({
  name: "my_tool",
  description: "Description for the LLM",
  parameters: z.object({
    input: z.string().describe("What this input is for"),
  }),
  execute: async ({ input }) => {
    // Implementation
    return { result: "success", data: input };
  },
});
```

2. Export from `source/tools/index.ts`
3. Add to agent's tools in the command file

## Available Tools

### jinaReaderTool (fetch_page)
Fetches any URL and converts to clean markdown using Jina Reader. No API key required.
```typescript
import { jinaReaderTool } from '../tools/jina-reader.js';
// Returns: { success, url, title, content, links, lineCount }
```

### exaSearchTool (exa_search)
Semantic web search using Exa. Requires `EXA_API_KEY` environment variable.
```typescript
import { exaSearchTool } from '../tools/exa-search.js';
// Returns: { success, query, resultCount, results: [{ title, url, publishedDate }] }
```

### exaGetContentsTool (exa_get_contents)
Fetch full text content of URLs using Exa. Requires `EXA_API_KEY`.
```typescript
import { exaGetContentsTool } from '../tools/exa-search.js';
// Returns: { success, contentCount, contents: [{ title, url, text }] }
```

### readFileTool (read_file)
Read local files from the filesystem.

## Configuration

### API Key (required)

Set your Anthropic API key using one of these methods (in priority order):

1. **`.env` file** (recommended for development):

   ```bash
   cp .env.example .env
   # Edit .env and add your key
   ```

2. **Environment variable**:

   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Config file** (`~/.config/agentmaster/config.json`):
   ```json
   {
     "anthropicApiKey": "sk-ant-..."
   }
   ```

### Full Config File

```json
{
  "anthropicApiKey": "sk-ant-...",
  "defaultModel": "claude-sonnet-4-20250514",
  "maxIterations": 10,
  "agents": {
    "myagent": {
      "model": "claude-opus-4-20250514",
      "maxIterations": 5
    }
  }
}
```

### Environment Variables

- `ANTHROPIC_API_KEY` - API key (overrides config file)
- `AGENTMASTER_MODEL` - Default model (overrides config file)
- `EXA_API_KEY` - Exa API key for search tools (optional)

### Project Config (`./config.json`)

Project-level configuration stored in the project root. Used for agent-specific settings like news sources.

```json
{
  "news": {
    "sites": ["aftonbladet.se", "omni.se"],
    "interests": ["technology", "sports"],
    "defaultCount": 5
  }
}
```

This is loaded via `getProjectConfig()` and `getNewsConfig()` from `core/project-config.ts`.

## Key APIs

### createAgent(config)

Creates a reusable agent instance:

```typescript
const agent = createAgent({
  name: "myagent",
  systemPrompt: "System instructions...",
  tools: { tool_name: toolDefinition },
  maxIterations: 10,
  model: "claude-sonnet-4-20250514",
});
```

### useAgent(agent)

React hook for using an agent in components:

```typescript
const {
  messages, // Conversation history
  isLoading, // Currently processing
  streamingContent, // Partial response being streamed
  currentToolCalls, // Active tool executions
  error, // Any error that occurred
  sendMessage, // Send a new message
  cancel, // Cancel current request
  reset, // Reset conversation
} = useAgent(agent);
```

### defineTool(definition)

Helper for defining tools with type safety:

```typescript
const tool = defineTool({
  name: 'tool_name',
  description: 'What this tool does',
  parameters: z.object({ ... }),
  execute: async (params, context) => { ... },
});
```

## Development

node dist/cli.js ask

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run CLI
npm start
# or
agentmaster3
```

## Existing Agents

### ask
General-purpose assistant without tools.
```bash
node dist/cli.js ask
node dist/cli.js ask --prompt "What is TypeScript?"
```

### news
News aggregation agent that fetches and summarizes news from configured sites.
```bash
node dist/cli.js news
node dist/cli.js news --prompt "get tech news"
```

Uses `jinaReaderTool` to fetch news site homepages directly (real-time content).
Configure sources in `./config.json` under the `news` key.

## Important Notes

- Agents should have few, focused tools (that's the point of this architecture)
- Tool execution is displayed in a Claude Code-inspired compact format:
  - Running: `⠋ fetch_page url="https://example.com"`
  - Complete: `✓ fetch_page (1.2s) → 150 lines`
- Streaming is enabled by default for responsive UX
- All text output uses Ink's React-based rendering

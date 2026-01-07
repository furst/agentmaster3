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
│   ├── list-pdfs.ts    # List PDF files in a directory
│   ├── read-pdf.ts     # Read and extract/summarize PDF content
│   ├── mindset.ts      # Read/save user investment philosophy
│   ├── obsidian-vault.ts # Read/write markdown notes in Obsidian vault
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
```typescript
import { readFileTool } from '../tools/read-file.js';
// Returns: { success, path, content, lineCount }
```

### listPdfsTool (list_pdfs)
List all PDF files in a directory, sorted by modification date (newest first).
```typescript
import { listPdfsTool } from '../tools/list-pdfs.js';
// Returns: { success, directory, count, files: [{ name, path, modifiedAt, sizeBytes }] }
```

### readPdfTool (read_pdf)
Read and extract text from a PDF file. Optionally uses AI (light model) to summarize or extract specific information.
```typescript
import { readPdfTool } from '../tools/read-pdf.js';
// Returns: { success, path, pageCount, textLength, truncated, summary|content }
```

### readMindsetTool (read_mindset)
Read the user's investment mindset/philosophy document. Uses path from finance config.
```typescript
import { readMindsetTool } from '../tools/mindset.js';
// Returns: { success, exists, path, content, lineCount }
```

### saveMindsetTool (save_mindset)
Save or update the user's investment mindset/philosophy document. Supports append mode.
```typescript
import { saveMindsetTool } from '../tools/mindset.js';
// Returns: { success, path, action, characterCount, lineCount }
```

### listVaultNotesTool (list_vault_notes)
List all markdown notes in the configured Obsidian vault. Supports subfolder filtering and sorting.
```typescript
import { listVaultNotesTool } from '../tools/obsidian-vault.js';
// Returns: { success, vaultPath, count, totalCount, files: [{ name, path, modifiedAt, sizeBytes }] }
```

### readVaultNoteTool (read_vault_note)
Read the contents of a markdown note from the Obsidian vault. Path validation ensures files stay within vault.
```typescript
import { readVaultNoteTool } from '../tools/obsidian-vault.js';
// Returns: { success, path, content, lineCount, sizeBytes, modifiedAt }
```

### writeVaultNoteTool (write_vault_note)
Write or update a markdown note in the Obsidian vault. Includes safety measures:
- Path validation (must be within vault, must be .md)
- Size limits (configurable max write size)
- Automatic backups before overwriting (configurable)
- Modes: "overwrite", "append", "create-only"
```typescript
import { writeVaultNoteTool } from '../tools/obsidian-vault.js';
// Returns: { success, path, action, sizeBytes, lineCount, backupCreated }
```

### webSearchTool (web_search)
Web search stub. Currently returns a placeholder - implement with Serper, Tavily, or Google Custom Search.
```typescript
import { webSearchTool } from '../tools/web-search.js';
// Returns: { success: false, query, results: [], note, suggestedImplementation }
```

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
  },
  "obsidian": {
    "vaultPath": "/path/to/your/obsidian/vault",
    "maxFileSizeBytes": 102400,
    "maxWriteSizeBytes": 51200,
    "backupOnWrite": true,
    "allowedSubfolders": ["notes", "daily"]
  }
}
```

This is loaded via `getProjectConfig()`, `getNewsConfig()`, and `getObsidianConfig()` from `core/project-config.ts`.

#### Obsidian Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `vaultPath` | (required) | Absolute path to the Obsidian vault directory |
| `maxFileSizeBytes` | 102400 (100KB) | Maximum file size that can be read |
| `maxWriteSizeBytes` | 51200 (50KB) | Maximum content size that can be written |
| `backupOnWrite` | true | Create `.bak` backup before overwriting files |
| `allowedSubfolders` | (all) | If set, restrict operations to these subfolders only |

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
- **Always update CLAUDE.md when making changes** - Adding new tools, agents, configurations, or modifying the architecture should be reflected here to keep documentation in sync with the codebase

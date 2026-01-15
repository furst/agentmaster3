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
│   ├── news.tsx        # News aggregation agent
│   └── bg3.tsx         # Baldur's Gate 3 assistant
├── core/
│   ├── config.ts       # User config (~/.config/agentmaster/)
│   ├── project-config.ts # Project config (./config.json)
│   ├── llm.ts          # Anthropic client wrapper
│   ├── tools.ts        # Tool definition helpers
│   ├── agent.ts        # Agent factory + useAgent hook
│   ├── timeline.ts     # Timeline types + useAgentTimeline hook
│   ├── events.ts       # Event bus for sub-agent/todo communication
│   ├── session-todo.ts # Session-scoped todo state management
│   ├── sub-agent.ts    # Sub-agent factory (hierarchical agents)
│   └── memory.ts       # Per-agent persistent memory system
├── agents/             # Reusable sub-agent definitions
│   ├── index.ts        # Exports all sub-agents
│   ├── pdf-agent.ts    # PDF document analysis
│   ├── web-research-agent.ts # Web search and content fetching
│   └── vault-agent.ts  # Obsidian vault operations
├── components/
│   ├── AgentShell.tsx  # Main agent UI wrapper (uses TimelineView)
│   ├── TimelineView.tsx # Chronological view of messages and tool calls
│   ├── Message.tsx     # Message rendering
│   ├── ToolCall.tsx    # Tool call visualization (Claude Code-inspired)
│   ├── SubAgentStatus.tsx # Sub-agent progress visualization
│   ├── TodoList.tsx    # Session-scoped todo list display
│   ├── ModelIndicator.tsx # Displays current model and reasoning status in header
│   ├── Timeline.tsx    # Status timeline (inline status bar)
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
│   ├── holdings.ts     # Parse and read stock holdings
│   ├── research-notes.ts # Save/read research findings
│   ├── session-todo.ts # Session-scoped todo list management
│   ├── memory.ts       # Per-agent persistent memory
│   └── index.ts        # Tool registry
└── utils/
    ├── format.ts       # Text formatting helpers
    ├── streaming.ts    # Stream processing utilities
    └── model.ts        # Model name parsing and shortening utilities
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

### parseHoldingsImageTool (parse_holdings_image)
Parse a screenshot of holdings (from Avanza) using AI vision (Gemini Flash). Extracts holdings data and saves to holdings.json. Users drop images directly into the terminal which attaches them as `[Image #1]`.
```typescript
import { parseHoldingsImageTool } from '../tools/holdings.js';
// Parameters: { imagePath: string } - full path to the image file
// Returns: { success, parsedFrom, savedTo, holdingsCount, totalValue, holdings }
```

### readHoldingsTool (read_holdings)
Read the user's current stock holdings from the saved holdings.json file.
```typescript
import { readHoldingsTool } from '../tools/holdings.js';
// Parameters: { ticker?: string } - optional filter by ticker/name
// Returns: { success, updatedAt, source, holdingsCount, totalValue, holdings }
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
Write or update a markdown note in the Obsidian vault. New files automatically get:
- **Frontmatter** with tags (inferred from content or explicit), status, type fields
- **References section** at the end
- **Auto-tagging**: recipes get `cooking, recipe`; code gets `tech, code`; guides get `guide`

Safety measures: path validation, size limits, automatic backups.
```typescript
import { writeVaultNoteTool } from '../tools/obsidian-vault.js';
// Parameters: { path, content, mode?, tags?, type?, skipFrontmatter? }
// Returns: { success, path, action, sizeBytes, lineCount, backupCreated, tags? }
```

### searchVaultTool (search_vault)
Search through note contents with fuzzy matching and multi-word AND queries. All words must match (with typo tolerance).
```typescript
import { searchVaultTool } from '../tools/obsidian-vault.js';
// Parameters: { query, subfolder?, fuzzyThreshold? (0-1, default 0.4), maxResults? }
// Returns: { success, query, queryWords, resultCount, results: [{ path, name, score, matchedWords, preview }] }
// Example: "beef recipe" finds notes containing both "beef" AND "recipe" (or fuzzy variants like "recipes")
```

### createTodosTool (create_todos)
Create a session-scoped todo list for tracking complex multi-step tasks. Persists to disk.
```typescript
import { createTodosTool } from '../tools/session-todo.js';
// Parameters: { items: string[] }
// Returns: { success, sessionId, todoCount, todos: [{ id, content, status }] }
```

### updateTodoTool (update_todo)
Update the status of a todo item. Mark as in_progress when starting, completed when done.
```typescript
import { updateTodoTool } from '../tools/session-todo.js';
// Parameters: { todoId, status: 'in_progress' | 'completed' }
// Returns: { success, todoId, newStatus, content, progress }
```

### getTodosTool (get_todos)
Get the current todo list and progress for this session.
```typescript
import { getTodosTool } from '../tools/session-todo.js';
// Returns: { success, hasTodos, progress, inProgress, todos }
```

### clearTodosTool (clear_todos)
Clear all todos for this session.
```typescript
import { clearTodosTool } from '../tools/session-todo.js';
// Returns: { success, message }
```

### saveResearchNoteTool (save_research_note)
Save research findings to a note file for later reference.
```typescript
import { saveResearchNoteTool } from '../tools/research-notes.js';
// Parameters: { topic, content, tags?, noteId? }
// Returns: { success, noteId, path, action, topic, contentLength }
```

### readResearchNotesTool (read_research_notes)
Read research notes by ID or search by topic.
```typescript
import { readResearchNotesTool } from '../tools/research-notes.js';
// Parameters: { noteId?, topicSearch? }
// Returns: { success, notes: [{ id, topic, tags, updatedAt, contentPreview }] }
```

### listResearchNotesTool (list_research_notes)
List all saved research notes with optional tag filtering.
```typescript
import { listResearchNotesTool } from '../tools/research-notes.js';
// Parameters: { tag? }
// Returns: { success, directory, noteCount, notes }
```

### webSearchTool (web_search)
Web search stub. Currently returns a placeholder - implement with Serper, Tavily, or Google Custom Search.
```typescript
import { webSearchTool } from '../tools/web-search.js';
// Returns: { success: false, query, results: [], note, suggestedImplementation }
```

### saveMemoryTool (save_memory)
Save persistent per-agent memory. Memory is loaded into the system prompt at agent startup, so no read tool is needed.
```typescript
import { saveMemoryTool } from '../tools/memory.js';
// Parameters: { agentName: string, content: string, append?: boolean }
// Returns: { success, path, action, characterCount, message }
```

Memory files are stored at `./data/memory/{agentName}.md`. Each agent (ask, news, finance, bg3) has separate memory.

**When to save memory:**
- User preferences or context
- Progress updates (for game agents like bg3)
- Important decisions or facts to remember across sessions

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

Project-level configuration stored in the project root. Used for shared model settings and agent-specific configuration.

```json
{
  "models": {
    "light": "google:gemini-3-flash-preview",
    "strong": "google:gemini-3-pro-preview",
    "reasoning": {
      "enabled": false,
      "budgetTokens": 10000
    }
  },
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

This is loaded via `getProjectConfig()`, `getModelsConfig()`, `getNewsConfig()`, and `getObsidianConfig()` from `core/project-config.ts`.

#### Models Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `light` | `google:gemini-3-flash-preview` | Light model for fast tasks (ask, news, PDF summarization) |
| `strong` | `google:gemini-3-pro-preview` | Strong model for complex reasoning tasks (finance) |
| `reasoning.enabled` | false | Enable extended thinking for supported models |
| `reasoning.budgetTokens` | 10000 | Token budget for extended thinking |

**Agent model assignment:**
- `ask` - uses `models.light`
- `news` - uses `models.light`
- `finance` - uses `models.strong` (or `finance.strongModel` if overridden)

**Note:** The agent header displays the current model (e.g., `gemini-2.5-pro` or `gemini-2.5-flash`) and shows `+thinking` when reasoning is enabled. Tools may use `light` model internally - this is visible in tool output (`modelUsed` field).

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

Creates a reusable agent instance with conversation history, tool support, inline sub-agents, hooks, session management, and cost tracking:

```typescript
const agent = createAgent({
  name: "myagent",
  systemPrompt: "System instructions...",
  tools: { tool_name: toolDefinition },
  maxIterations: 10,
  model: "claude-sonnet-4-20250514",

  // NEW: Inline sub-agent definitions (Claude SDK-style)
  agents: {
    "code-reviewer": {
      description: "Expert code review specialist",
      prompt: "You are a code review expert...",
      tools: ["read_file", "grep"],  // Tool names from parent
      model: "sonnet",  // Aliases: 'opus', 'sonnet', 'haiku'
    },
  },

  // NEW: Hook callbacks
  hooks: {
    onBeforeToolCall: async (toolName, input, context) => {
      console.log(`[AUDIT] ${toolName}`);
      return { action: 'allow' };
    },
    onAfterToolCall: async (toolName, input, result, context) => {
      return {}; // Can return { modifiedResult } to transform
    },
    onStart: async (message) => { /* called when processing starts */ },
    onFinish: async (response, stats) => { /* called when done */ },
  },

  // NEW: Structured output schema
  outputSchema: z.object({
    summary: z.string(),
    issues: z.array(z.object({
      severity: z.enum(['low', 'medium', 'high']),
      description: z.string(),
    })),
  }),
});

// Agent methods
agent.sendMessage(prompt, onEvent);           // Stream response with tools
agent.sendMessageStructured(prompt, schema?); // Get typed JSON response
agent.getStats();                             // Get cost & token tracking
agent.exportSession();                        // Save session for later
agent.importSession(session);                 // Resume previous session
agent.getSessionId();                         // Get current session ID
agent.reset();                                // Clear history and stats
agent.cancel();                               // Cancel current request
```

**Config options:**

| Option | Type | Description |
|--------|------|-------------|
| `name` | string | Agent identifier |
| `systemPrompt` | string | System instructions |
| `tools` | Record<string, CoreTool> | Available tools |
| `maxIterations` | number | Max tool call loops (default: 10) |
| `model` | string | Model to use |
| `reasoning` | ReasoningConfig | Extended thinking config |
| `agents` | Record<string, AgentDefinition> | Inline sub-agent definitions |
| `hooks` | AgentHooks | Lifecycle callbacks |
| `outputSchema` | ZodType | Schema for structured output |

### useAgent(agent)

React hook for using an agent in components:

```typescript
const {
  messages,          // Conversation history
  isLoading,         // Currently processing
  streamingContent,  // Partial response being streamed
  currentToolCalls,  // Active tool executions
  error,             // Any error that occurred
  stats,             // NEW: Cost and token tracking
  sendMessage,       // Send a new message
  cancel,            // Cancel current request
  reset,             // Reset conversation
} = useAgent(agent);
```

### useAgentTimeline(agent)

React hook that wraps `useAgent` and provides a chronological timeline view where text segments and tool calls are interleaved in the order they occurred (Claude Code-style):

```typescript
const {
  // Timeline state
  timeline,          // TimelineEntry[] - chronological entries
  streamingEntry,    // Current streaming text segment (or null)

  // Original state (backwards compatible)
  messages,          // Conversation history
  isLoading,         // Currently processing
  currentToolCalls,  // Active tool executions
  error,             // Any error that occurred
  stats,             // Cost and token tracking

  // Actions
  sendMessage,       // Send a new message
  cancel,            // Cancel current request
  reset,             // Reset conversation
} = useAgentTimeline(agent);
```

**TimelineEntry types:**
- `user-message` - User input
- `text-segment` - Finalized assistant text
- `tool-call` - Tool invocation with status
- `streaming-text` - Currently streaming text

**Visual output (via TimelineView component):**
```
> User message here

● Assistant text starts here...

● search_vault "recipe beef"
└  4 notes found

● More assistant text after tool...
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

## Inline Agent Definitions (Claude SDK-style)

Define sub-agents declaratively within `createAgent()` using the `agents` option. This is cleaner than manually creating sub-agent tools:

```typescript
const orchestrator = createAgent({
  name: 'research-orchestrator',
  systemPrompt: 'You coordinate research tasks...',
  model: 'google:gemini-2.5-pro',
  tools: createToolsRecord([exaSearchTool, readPdfTool]),

  agents: {
    'web-researcher': {
      description: 'Specialist for web research and news gathering',
      prompt: `You are a web research expert. Search for information
and synthesize findings into clear summaries.`,
      tools: ['exa_search', 'exa_get_contents'],  // Reference parent tools by name
      model: 'haiku',  // Use lighter model for cost efficiency
      maxSteps: 8,
    },

    'document-analyzer': {
      description: 'PDF and document analysis specialist',
      prompt: 'You analyze documents and extract key information.',
      tools: ['list_pdfs', 'read_pdf'],
      model: 'sonnet',
    },
  },
});
```

**AgentDefinition options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | required | When to use this agent (shown to LLM) |
| `prompt` | string | required | Sub-agent's system prompt |
| `tools` | string[] or ToolDef[] | inherit all | Tools available (names or definitions) |
| `model` | string | 'sonnet' | Model alias or full spec |
| `maxSteps` | number | 10 | Maximum agentic steps |

**Model aliases:** `'opus'`, `'sonnet'`, `'haiku'` → resolved to full Anthropic model IDs.

## Hooks System

Intercept and customize tool execution with hooks:

```typescript
const agent = createAgent({
  name: 'secure-agent',
  systemPrompt: '...',
  tools: { ... },

  hooks: {
    // Called before each tool execution
    onBeforeToolCall: async (toolName, input, context) => {
      // Audit logging
      console.log(`[${new Date().toISOString()}] ${toolName}`, input);

      // Block dangerous operations
      if (toolName === 'bash' && input.command?.includes('rm -rf')) {
        return {
          action: 'deny',
          denyReason: 'Destructive commands not allowed'
        };
      }

      // Modify input
      if (toolName === 'fetch_page') {
        return {
          action: 'modify',
          modifiedInput: { ...input, timeout: 5000 },
        };
      }

      return { action: 'allow' };
    },

    // Called after each tool execution
    onAfterToolCall: async (toolName, input, result, context) => {
      // Log results
      console.log(`${toolName} completed in ${context.duration}ms`);

      // Optionally transform result
      if (toolName === 'read_file' && result.content) {
        return {
          modifiedResult: {
            ...result,
            content: result.content.slice(0, 10000), // Truncate
          },
        };
      }

      return {};
    },

    // Called when agent starts processing
    onStart: async (message) => {
      console.log('Processing:', message);
    },

    // Called when agent finishes
    onFinish: async (response, stats) => {
      console.log(`Done! Cost: $${stats.costUSD.toFixed(4)}`);
    },
  },
});
```

**Hook actions:**
- `{ action: 'allow' }` - Proceed with tool execution
- `{ action: 'deny', denyReason: '...' }` - Block tool, return error to LLM
- `{ action: 'modify', modifiedInput: {...} }` - Transform input before execution

## Structured Output

Get typed JSON responses using Zod schemas:

```typescript
import { z } from 'zod';

// Define output schema
const ReviewSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  issues: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    file: z.string(),
    line: z.number().optional(),
    description: z.string(),
    suggestion: z.string().optional(),
  })),
});

// Option 1: Set schema in config
const agent = createAgent({
  name: 'code-reviewer',
  systemPrompt: 'Review code and return structured feedback.',
  outputSchema: ReviewSchema,
});

const { data, stats } = await agent.sendMessageStructured('Review auth.ts');
// data is typed as z.infer<typeof ReviewSchema>

// Option 2: Pass schema per-call
const { data } = await agent.sendMessageStructured(
  'Analyze this codebase',
  ReviewSchema
);
```

## Cost Tracking

Track token usage and costs across main agent and sub-agents:

```typescript
const agent = createAgent({ ... });

// After processing
const stats = agent.getStats();
console.log(`Total cost: $${stats.costUSD.toFixed(4)}`);
console.log(`Total tokens: ${stats.totalTokens}`);
console.log(`Tool calls: ${stats.toolCallCount}`);
console.log(`Duration: ${stats.duration}ms`);

// Per-model breakdown (useful with sub-agents)
for (const [model, usage] of Object.entries(stats.modelUsage)) {
  console.log(`${model}: $${usage.costUSD.toFixed(4)} (${usage.usage.totalTokens} tokens)`);
}
```

**AgentStats interface:**

```typescript
interface AgentStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  costUSD: number;
  toolCallCount: number;
  duration: number;
  modelUsage: Record<string, CostTracking>;
}
```

Supported models with pricing:
- Anthropic: claude-opus-4-5, claude-sonnet-4-5, claude-sonnet-4, claude-haiku-3-5
- Google: gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash, gemini-3-pro, gemini-3-flash

## Session Management

Save and restore conversations for multi-turn workflows:

```typescript
const agent = createAgent({ name: 'assistant', ... });

// Have a conversation
await agent.sendMessage('Analyze the codebase', onEvent);
await agent.sendMessage('What are the main issues?', onEvent);

// Export session for later
const session = agent.exportSession();
// session = { id, agentName, createdAt, updatedAt, messages, stats }

// Save to file/database
await fs.writeFile('session.json', JSON.stringify(session));

// Later: restore and continue
const savedSession = JSON.parse(await fs.readFile('session.json', 'utf-8'));
const newAgent = createAgent({ name: 'assistant', ... });
newAgent.importSession(savedSession);

// Continue conversation with full context
await newAgent.sendMessage('Show me how to fix the top issue', onEvent);

// Get current session ID
const sessionId = agent.getSessionId();
```

**AgentSession interface:**

```typescript
interface AgentSession {
  id: string;
  agentName: string;
  createdAt: number;
  updatedAt: number;
  messages: CoreMessage[];
  stats: AgentStats;
}
```

## Hierarchical Agents (Orchestrator-Workers)

The architecture supports hierarchical agent patterns where a Main Agent (orchestrator) can delegate tasks to specialized Sub-Agents (workers). This enables:
- Strong models orchestrating lighter/cheaper models for parallel work
- Real-time visibility into sub-agent progress via the event bus
- Clean separation of concerns between orchestration and task execution

### Event Bus (`source/core/events.ts`)

Singleton event emitter for sub-agent communication:

```typescript
import { agentEvents, generateProcessId } from '../core/events.js';

// Generate unique process ID
const processId = generateProcessId(); // "subagent_1234567890_1"

// Emit events
agentEvents.emit({
  type: 'subAgentStart',
  processId,
  agentName: 'research_agent',
  parentToolCallId: 'tc_123',
  task: 'Research AAPL earnings',
  model: 'google:gemini-2.5-flash',
  timestamp: Date.now(),
});

// Subscribe to events
agentEvents.on('subAgentToolCall', (event) => {
  console.log(`${event.toolName}: ${event.status}`);
});

// Available events:
// - subAgentStart: Sub-agent begins execution
// - subAgentToolCall: Sub-agent calls a tool (running/complete/error)
// - subAgentLog: Debug/info messages
// - subAgentFinish: Sub-agent completes (success/error)
```

### createSubAgentTool(config)

Factory function that creates a tool wrapping a sub-agent. When the main agent calls this tool, it spawns a complete agentic loop with its own tools:

```typescript
import { createSubAgentTool } from '../core/sub-agent.js';
import { exaSearchTool, exaGetContentsTool } from '../tools/exa-search.js';

const webResearchAgent = createSubAgentTool({
  name: 'web_research_agent',
  description: 'Specialized agent for web research. Use when you need to search and analyze web content.',
  systemPrompt: `You are a web research specialist. Your job is to:
1. Search for relevant information using exa_search
2. Fetch full content from promising URLs
3. Synthesize findings into a clear summary`,
  model: 'google:gemini-2.5-flash',  // Light model for cost efficiency
  tools: [exaSearchTool, exaGetContentsTool],
  maxSteps: 8,
});

// Use in main agent
const orchestrator = createAgent({
  name: 'orchestrator',
  systemPrompt: 'You coordinate specialized agents...',
  model: 'google:gemini-2.5-pro',  // Strong model for orchestration
  tools: createToolsRecord([webResearchAgent, documentAnalysisAgent]),
});
```

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Tool name (snake_case) |
| `description` | string | required | Description for the LLM |
| `systemPrompt` | string | required | Sub-agent's system prompt |
| `model` | string | required | Model spec (e.g., "google:gemini-2.5-flash") |
| `tools` | array/record | required | Tools available to sub-agent |
| `maxSteps` | number | 10 | Maximum agentic steps |
| `inputSchema` | ZodObject | `{task, context?}` | Custom input schema |
| `taskTransformer` | function | - | Transform input to task string |
| `resultTransformer` | function | - | Transform result before returning |

**Return value:**

```typescript
{
  success: boolean;
  agentName: string;
  processId: string;
  response: string;        // Final text from sub-agent
  toolCallCount: number;
  toolCalls: ToolCallSummary[];
  duration: number;
  error?: string;
}
```

### SubAgentStatus Component

React/Ink component that visualizes sub-agent progress in real-time:

```tsx
import { SubAgentStatus } from '../components/SubAgentStatus.js';

// In your component
<SubAgentStatus
  showCompletedTools={true}  // Show completed tool calls
  maxToolCalls={5}           // Limit visible tool calls
  compact={false}            // Full or compact mode
/>
```

**Visual output:**

```
⚙ Sub-Agents
└─ 🤖 Web Research Agent (Active)
   ├─ ⠋ exa_search "AAPL earnings Q4"
   ├─ ✓ exa_get_contents (2.3s) → 3 pages
   └─ ⠋ read_pdf "report.pdf"...

└─ 🤖 Analysis Agent (Complete - 5.2s)
   ├─ ✓ read_holdings (0.4s) → 12 holdings
   └─ ✓ read_mindset (0.2s) → 45 lines
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `processId` | string | - | Filter to specific sub-agent |
| `agentName` | string | - | Filter by agent name |
| `showCompletedTools` | boolean | true | Show completed tool calls |
| `maxToolCalls` | number | 10 | Max tool calls per sub-agent |
| `compact` | boolean | false | Single-line per agent |

### Example: Research Orchestrator

```tsx
// source/commands/research.tsx
import { createAgent } from "../core/agent.js";
import { createSubAgentTool } from "../core/sub-agent.js";
import { AgentShell } from "../components/AgentShell.js";

export default function Research({ options }) {
  // Create specialized sub-agents
  const webResearchAgent = useMemo(() => createSubAgentTool({
    name: 'web_research_agent',
    description: 'For web searches and news',
    systemPrompt: 'You are a web research specialist...',
    model: 'google:gemini-2.5-flash',
    tools: [exaSearchTool, exaGetContentsTool],
  }), []);

  const documentAgent = useMemo(() => createSubAgentTool({
    name: 'document_analysis_agent',
    description: 'For analyzing PDFs and reports',
    systemPrompt: 'You analyze documents...',
    model: 'google:gemini-2.5-flash',
    tools: [listPdfsTool, readPdfTool],
  }), []);

  // Create orchestrator with sub-agents as tools
  const orchestrator = useMemo(() => createAgent({
    name: 'research-orchestrator',
    systemPrompt: `You coordinate research tasks:
- Use web_research_agent for online searches
- Use document_analysis_agent for PDF analysis
- Synthesize results into comprehensive answers`,
    model: 'google:gemini-2.5-pro',
    tools: createToolsRecord([webResearchAgent, documentAgent]),
  }), [webResearchAgent, documentAgent]);

  return (
    <AgentShell
      agent={orchestrator}
      name="Research Orchestrator"
      color="magenta"
    />
  );
}
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

### bg3
Baldur's Gate 3 assistant for quests, builds, companions, and combat tactics.
```bash
node dist/cli.js bg3
node dist/cli.js bg3 --prompt "How do I spec a Warlock?"
```

Features:
- Concise, spoiler-aware answers
- Persistent memory for character, party, and progress
- Web research sub-agent for wiki lookups

Memory is saved when you share character info (class, level, party changes, quest progress).

## Important Notes

- Agents should have few, focused tools (that's the point of this architecture)
- Tool execution is displayed in a Claude Code-inspired compact format:
  - Running: `⠋ fetch_page url="https://example.com"`
  - Complete: `✓ fetch_page (1.2s) → 150 lines`
- Streaming is enabled by default for responsive UX
- All text output uses Ink's React-based rendering
- **Always update CLAUDE.md when making changes** - Adding new tools, agents, configurations, or modifying the architecture should be reflected here to keep documentation in sync with the codebase

import React, { useMemo } from "react";
import { z } from "zod";
import { createAgent } from "../core/agent.js";
import { AgentShell } from "../components/AgentShell.js";
import { createToolsRecord } from "../core/tools.js";
import { getModelsConfig } from "../core/project-config.js";
import { buildOrchestratorPrompt } from "../core/orchestrator-prompt.js";

// Sub-agents
import { createVaultAgent } from "../agents/vault-agent.js";
import { createWebResearchAgent } from "../agents/web-research-agent.js";

// Direct tools
import { createTodosTool, updateTodoTool, getTodosTool } from "../tools/session-todo.js";

export const options = z.object({
  prompt: z
    .string()
    .optional()
    .describe("Initial prompt to send to the assistant"),
});

type Props = {
  options: z.infer<typeof options>;
};

function buildSystemPrompt(): string {
  return buildOrchestratorPrompt({
    role: `You are a helpful, friendly, and knowledgeable assistant. You help with questions, explanations, writing, brainstorming, and problem-solving.`,

    subAgents: [
      {
        name: "vault_agent",
        description: "Manages Obsidian vault (notes, knowledge base)",
        useCases: [
          "Save this to my notes",
          "Find my notes about...",
          "What recipes do I have?",
          "Search my knowledge base",
        ],
      },
      {
        name: "web_research_agent",
        description: "Searches the web and fetches content",
        useCases: [
          "Search for...",
          "What's happening with...",
          "Find information about...",
          "Current events",
        ],
      },
    ],

    directTools: [
      { name: "create_todos", description: "Create task list for complex work" },
      { name: "update_todo", description: "Update task progress" },
      { name: "get_todos", description: "Check current tasks" },
    ],

    additionalInstructions: `## Task Tracking

For complex tasks with 3+ steps, create a todo list first:
1. Call \`create_todos\` with specific, actionable items
2. As you work, call \`update_todo\` to mark items in_progress then completed
3. This helps track progress and keeps the user informed

Example: "Research 3 topics" → create_todos with ["Research topic 1", "Research topic 2", "Research topic 3"]

DO NOT create todos for simple single-step tasks.

## General Guidelines

- Be clear and concise
- When fetching content from the web, offer to save useful items to the vault
- When performing vault operations, be brief - don't comment on note content
- Be honest about limitations or uncertainty

## Content Formatting

Use ContentCard markers for structured content:

:::recipe "Recipe Name"
Prep Time: X minutes

## Ingredients
- Item 1
- Item 2

## Instructions
1. Step one
2. Step two
:::

Available types: \`recipe\`, \`summary\`, \`list\`, \`info\`, \`warning\`, \`success\`

## Vault Notes

When saving to vault:
- Save to "Bucket" folder (e.g., "Bucket/Recipe Name.md")
- Use content title as filename
- Format as clean markdown`,
  });
}

export default function Ask({ options }: Props) {
  const modelsConfig = getModelsConfig();

  // Create sub-agents
  const vaultAgent = useMemo(() => createVaultAgent(), []);
  const webResearchAgent = useMemo(() => createWebResearchAgent(), []);

  const agent = useMemo(() => {
    return createAgent({
      name: "ask",
      systemPrompt: buildSystemPrompt(),
      model: modelsConfig.light,
      tools: createToolsRecord([
        vaultAgent,
        webResearchAgent,
        createTodosTool,
        updateTodoTool,
        getTodosTool,
      ]),
    });
  }, [modelsConfig.light, vaultAgent, webResearchAgent]);

  return (
    <AgentShell
      agent={agent}
      name="Ask"
      color="cyan"
      placeholder="Ask me anything..."
      initialPrompt={options.prompt}
      welcomeMessage="Welcome! I'm a helpful assistant with access to your notes and web research. Ask me anything!"
    />
  );
}

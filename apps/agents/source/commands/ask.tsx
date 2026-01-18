import React from "react";
import {
  AgentShell,
  getModelsConfig,
  buildOrchestratorPrompt,
  buildMemoryPrompt as buildMemoryPromptSection,
  commandOptions,
  useAgentCommand,
  createTaskTool,
  // Framework tools
  saveMemoryTool,
  webFetchTool,
  webSearchTool,
  webResearchTool,
  webAnswerTool,
  listVaultNotesTool,
  readVaultNoteTool,
  writeVaultNoteTool,
  searchVaultTool,
  readFileTool,
  listPdfsTool,
  readPdfTool,
  askUserQuestionTool,
  enterPlanModeTool,
  exitPlanModeTool,
  readOnlyToolsRecord,
} from "@conductor/core";
import type { CommandProps } from "@conductor/core";
import { registerPersonalObsidianHooks } from "../config/index.js";

// Register personal obsidian hooks at module load time
registerPersonalObsidianHooks();

export const options = commandOptions;

const AGENT_NAME = "ask";

// Create the Task tool with access to read-only tools for sub-agents
const taskToolDef = createTaskTool({
  ...readOnlyToolsRecord,
  // Also include ask_user_question for the plan agent
  ask_user_question: askUserQuestionTool.tool,
});

function buildSystemPrompt(): string {
  const memorySection = buildMemoryPromptSection(AGENT_NAME);

  return buildOrchestratorPrompt({
    role: `You are a helpful, friendly, and knowledgeable assistant. You help with questions, explanations, writing, brainstorming, and problem-solving.`,

    subAgents: [
      {
        name: "task (explore)",
        description: "Launches an explore sub-agent for research and information gathering",
        useCases: [
          "Search the web for...",
          "Find information about...",
          "Look up...",
          "What's happening with...",
          "Research multiple sources",
        ],
      },
      {
        name: "task (plan)",
        description: "Launches a planning sub-agent that can ask clarifying questions",
        useCases: [
          "Help me plan...",
          "Design an approach for...",
          "What should I consider for...",
        ],
      },
    ],

    directTools: [
      {
        name: "save_memory",
        description: "Save important context about user preferences or ongoing work",
      },
      {
        name: "web_fetch",
        description: "Fetch full article content from URLs (use when saving to vault or need complete text)",
      },
      {
        name: "web_search",
        description: "Quick web search for finding information",
      },
      {
        name: "vault tools",
        description: "list_vault_notes, read_vault_note, write_vault_note, search_vault - manage Obsidian notes",
      },
      {
        name: "ask_user_question",
        description: "Ask the user a question when you need clarification",
      },
    ],

    additionalInstructions: `${memorySection}

## General Guidelines

- Be clear and concise
- When fetching content from the web, offer to save useful items to the vault
- When performing vault operations, be brief - don't comment on note content
- Be honest about limitations or uncertainty
- Use markdown formatting for structured content (headers, lists, bold, etc.)

## Vault Notes

When saving to vault:
- Save to "Bucket" folder (e.g., "Bucket/Recipe Name.md")
- Use content title as filename
- Format as clean markdown

## Memory

Save to memory (agentName="${AGENT_NAME}") when user shares:
- Preferences about how they like responses
- Ongoing projects or context
- Personal details relevant to future conversations`,
  });
}

export default function Ask({ options }: CommandProps) {
  const modelsConfig = getModelsConfig();

  const agent = useAgentCommand({
    name: AGENT_NAME,
    buildSystemPrompt,
    model: modelsConfig.light,
    tools: [
      // Memory
      saveMemoryTool,
      // Web tools (direct)
      webFetchTool,
      webSearchTool,
      webResearchTool,
      webAnswerTool,
      // Vault tools
      listVaultNotesTool,
      readVaultNoteTool,
      writeVaultNoteTool,
      searchVaultTool,
      // File tools
      readFileTool,
      listPdfsTool,
      readPdfTool,
      // User interaction
      askUserQuestionTool,
      // Plan mode
      enterPlanModeTool,
      exitPlanModeTool,
      // Task tool for sub-agents
      taskToolDef,
    ],
    // No more subAgents - we use the Task tool instead
    subAgents: [],
  });

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

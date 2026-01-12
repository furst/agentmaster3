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

    additionalInstructions: `## General Guidelines

- Be clear and concise
- When fetching content from the web, offer to save useful items to the vault
- When performing vault operations, be brief - don't comment on note content
- Be honest about limitations or uncertainty
- Use markdown formatting for structured content (headers, lists, bold, etc.)

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

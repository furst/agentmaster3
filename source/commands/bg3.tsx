import React from "react";
import { AgentShell } from "../components/AgentShell.js";
import { getModelsConfig } from "../core/project-config.js";
import { buildMemoryPromptSection } from "../core/memory.js";
import {
  commandOptions,
  type CommandProps,
  useAgentCommand,
} from "../core/command-helpers.js";

// Tools
import { saveMemoryTool } from "../tools/memory.js";
import { exaGetContentsTool } from "../tools/exa-search.js";

// Sub-agents
import { createWebResearchAgent } from "../agents/web-research-agent.js";

export const options = commandOptions;

const AGENT_NAME = "bg3";

function buildSystemPrompt(): string {
  const memorySection = buildMemoryPromptSection(AGENT_NAME);

  return `You are a concise Baldur's Gate 3 assistant. You help with:
- Quest guidance and objectives
- Character builds and progression
- Companion interactions and approval
- Combat tactics and spell usage
- Item locations and secrets

${memorySection}

## Guidelines

1. **Be concise** - Short, direct answers. No verbose intros or outros.
2. **Spoiler-aware** - If answering could spoil story, ask first: "This involves a story spoiler. Continue?"
3. **Use memory** - Remember the user's character, party, and progress for personalized advice.
4. **Save updates** - When user shares class, level, party changes, or quest progress, save to memory.

## Response Formats

**For builds:**
**[Build Name]**
- Primary stat: X
- Key abilities: A, B, C
- Feat priority: ...

**For quests:**
**[Quest Name]**
1. Step one
2. Step two
...

**For companions:**
**[Companion] - [Topic]**
- Key point
- Approval tip

## Memory Updates

Save to memory when user shares:
- Class/subclass changes ("I'm a Warlock")
- Level ups ("Just hit level 5")
- Party composition ("Recruited Karlach")
- Quest progress ("Finished Goblin Camp")
- Important choices made

Use save_memory with agentName="${AGENT_NAME}".`;
}

export default function BG3({ options }: CommandProps) {
  const modelsConfig = getModelsConfig();

  const agent = useAgentCommand({
    name: AGENT_NAME,
    buildSystemPrompt,
    model: modelsConfig.light,
    tools: [saveMemoryTool, exaGetContentsTool],
    subAgents: [createWebResearchAgent],
    maxIterations: 8,
  });

  return (
    <AgentShell
      agent={agent}
      name="BG3"
      color="magenta"
      placeholder="Ask about quests, builds, companions..."
      initialPrompt={options.prompt}
      welcomeMessage="Baldur's Gate 3 assistant ready. Ask about quests, builds, companions, or combat tactics!"
    />
  );
}

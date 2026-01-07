import React, { useMemo } from 'react';
import { z } from 'zod';
import { createAgent } from '../core/agent.js';
import { AgentShell } from '../components/AgentShell.js';
import { createToolsRecord } from '../core/tools.js';
import { listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool } from '../tools/obsidian-vault.js';

/**
 * Command options using Zod schema
 */
export const options = z.object({
	prompt: z
		.string()
		.optional()
		.describe('Initial prompt to send to the assistant'),
});

type Props = {
	options: z.infer<typeof options>;
};

const SYSTEM_PROMPT = `You are a helpful, friendly, and knowledgeable assistant.

Your responses should be:
- Clear and concise
- Well-structured when explaining complex topics
- Honest about limitations or uncertainty

You can help with a wide variety of tasks including:
- Answering questions on various topics
- Explaining concepts and ideas
- Helping with writing and editing
- Brainstorming and ideation
- General problem-solving

## Notes & Storage

You have access to the user's Obsidian vault for storing and retrieving notes. Use these capabilities when:

- User says "save this", "store this", "remember this", "add to my notes" → write_vault_note
- User asks for a recipe, guide, or reference material → offer to save it to their vault
- User says "get my notes on...", "find my...", "what did I save about..." → list_vault_notes + read_vault_note
- User wants to update or add to existing notes → read first, then write with append mode

When saving content:
- Use descriptive filenames (e.g., "recipes/chocolate-cake.md", "guides/git-commands.md")
- Format content as clean markdown
- Ask the user where to save if unclear (or suggest a sensible default path)

When performing vault operations, be brief and factual. Don't comment on or evaluate the content of notes (no "nice recipe!", "interesting notes!", etc). Just confirm the action was completed.

Always aim to be helpful while being accurate and thoughtful in your responses.`;

/**
 * Ask command - general assistant with Obsidian vault tools
 */
export default function Ask({ options }: Props) {
	// Create agent instance (memoized to prevent recreation)
	const agent = useMemo(
		() =>
			createAgent({
				name: 'ask',
				systemPrompt: SYSTEM_PROMPT,
				tools: createToolsRecord([
					listVaultNotesTool,
					readVaultNoteTool,
					writeVaultNoteTool,
				]),
			}),
		[]
	);

	return (
		<AgentShell
			agent={agent}
			name="Ask"
			color="cyan"
			placeholder="Ask me anything..."
			initialPrompt={options.prompt}
			welcomeMessage="Welcome! I'm a helpful assistant. Ask me anything, or type a message to get started."
		/>
	);
}

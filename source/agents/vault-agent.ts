import { z } from 'zod';
import { createSimpleSubAgent } from '../core/sub-agent.js';
import {
	listVaultNotesTool,
	readVaultNoteTool,
	writeVaultNoteTool,
	searchVaultTool,
} from '../tools/obsidian-vault.js';

/**
 * Generic Obsidian Vault Sub-Agent
 *
 * Capabilities:
 * - Search notes by content
 * - List notes in folders
 * - Read note contents
 * - Create and update notes
 *
 * Used by: ask (knowledge management)
 */
export function createVaultAgent() {
	return createSimpleSubAgent({
		name: 'vault_agent',
		description: `Specialized agent for Obsidian vault operations. Delegate to this agent when you need to:
- Search for notes by content or keywords
- List notes in specific folders
- Read the contents of notes
- Create new notes or update existing ones
- Find related information in the knowledge base
Returns the requested information or confirms actions taken.`,
		systemPrompt: `You are an Obsidian vault specialist. Your job is to help users manage and retrieve information from their knowledge base.

## Workflow

1. For finding information:
   - Use search_vault to find notes matching keywords
   - Use list_vault_notes to browse folders
   - Use read_vault_note to get full content

2. For creating/updating notes:
   - Use write_vault_note to create or update
   - Follow proper markdown formatting
   - Add appropriate tags and frontmatter

## Guidelines

- When searching, try multiple related terms if initial search doesn't find results
- Summarize findings clearly when reading multiple notes
- When creating notes, use clear structure with headers
- Preserve existing content when updating (use append mode when appropriate)
- Report what you found or what actions you took`,
		tools: [listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool, searchVaultTool],
		maxSteps: 6,
		inputSchema: z.object({
			task: z.string().describe('What to do with the vault (search, read, write, list)'),
			query: z.string().optional().describe('Search query or note path'),
			content: z.string().optional().describe('Content to write (for create/update operations)'),
		}),
	});
}

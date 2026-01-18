/**
 * Memory tool - saves persistent per-agent memory
 *
 * Memory is loaded into system prompt at agent startup,
 * so no read tool is needed. This tool only handles saving.
 */

import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { saveAgentMemory } from '../core/memory.js';

/**
 * Save memory tool - saves or updates agent's persistent memory
 */
export const saveMemoryTool = defineTool({
	name: 'save_memory',
	description: `Save important information to your persistent memory. Use this when the user shares:
- Profile details (preferences, context, background)
- Progress updates or milestones
- Important decisions or facts to remember

Memory persists across conversations and is loaded at startup. Be selective - only save meaningful, lasting information. Don't save transient details.`,
	parameters: z.object({
		agentName: z.string().describe('Your agent name (e.g., "bg3", "ask", "finance")'),
		content: z.string().describe('The memory content to save (markdown format, be concise)'),
		append: z
			.boolean()
			.optional()
			.default(true)
			.describe('If true (default), append to existing memory. If false, replace entirely.'),
	}),
	execute: async ({ agentName, content, append }) => {
		const result = await saveAgentMemory(agentName, content, append);

		if (!result.success) {
			return {
				success: false,
				error: result.error,
			};
		}

		return {
			success: true,
			path: result.path,
			action: result.action,
			characterCount: content.length,
			message: `Memory ${result.action} successfully`,
		};
	},
});

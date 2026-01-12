/**
 * Memory system for persistent per-agent context
 *
 * Each agent has its own memory file at ./data/memory/{agentName}.md
 * Memory is loaded at agent startup and injected into the system prompt.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const MEMORY_DIR = './data/memory';

/**
 * Get the memory file path for an agent
 */
export function getMemoryPath(agentName: string): string {
	return join(MEMORY_DIR, `${agentName}.md`);
}

/**
 * Load memory for an agent (synchronous - for system prompt injection)
 * Returns null if no memory file exists
 */
export function loadAgentMemory(agentName: string): string | null {
	const path = getMemoryPath(agentName);
	if (!existsSync(path)) {
		return null;
	}
	try {
		return readFileSync(path, 'utf-8');
	} catch {
		return null;
	}
}

/**
 * Save or append to memory file
 */
export async function saveAgentMemory(
	agentName: string,
	content: string,
	append: boolean = true
): Promise<{ success: boolean; path: string; action: string; error?: string }> {
	const path = getMemoryPath(agentName);

	try {
		// Ensure directory exists
		const dir = dirname(path);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		let finalContent = content;
		if (append && existsSync(path)) {
			const existing = readFileSync(path, 'utf-8');
			const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
			finalContent = `${existing.trimEnd()}\n\n---\n*Updated: ${timestamp}*\n\n${content}`;
		}

		writeFileSync(path, finalContent, 'utf-8');

		return {
			success: true,
			path,
			action: append && existsSync(path) ? 'appended' : 'created',
		};
	} catch (error) {
		return {
			success: false,
			path,
			action: 'failed',
			error: (error as Error).message,
		};
	}
}

/**
 * Build a system prompt section with memory content
 * Returns empty string if no memory exists
 */
export function buildMemoryPromptSection(agentName: string): string {
	const memory = loadAgentMemory(agentName);
	if (!memory || memory.trim() === '') {
		return '';
	}

	return `## Your Memory

The following is your persistent memory from previous conversations. Use this context to provide personalized responses.

<memory>
${memory}
</memory>

When the user shares important information worth remembering, use save_memory to update your memory. Be selective - only save meaningful, lasting information.`;
}

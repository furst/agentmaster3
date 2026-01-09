import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { getFinanceConfig } from '../core/project-config.js';

interface ResearchNote {
	id: string;
	topic: string;
	content: string;
	createdAt: string;
	updatedAt: string;
	tags?: string[];
}

function getResearchDir(): string {
	const config = getFinanceConfig();
	return config.researchDirectory;
}

function generateNoteId(topic: string): string {
	const slug = topic
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 50);
	const timestamp = Date.now().toString(36);
	return `${slug}-${timestamp}`;
}

/**
 * Save research note tool - saves findings with timestamp, topic, and content
 */
export const saveResearchNoteTool = defineTool({
	name: 'save_research_note',
	description:
		'Save research findings to a note file. Use this to store important information gathered during research that you may need to reference later. Each note is saved as a separate file.',
	parameters: z.object({
		topic: z.string().describe('The topic or subject of this research (e.g., "AAPL Analysis", "Market Trends Q1")'),
		content: z.string().describe('The research content to save (markdown format)'),
		tags: z.array(z.string()).optional().describe('Optional tags for categorizing (e.g., ["stock", "tech", "earnings"])'),
		noteId: z.string().optional().describe('Optional: Update an existing note by providing its ID'),
	}),
	execute: async ({ topic, content, tags, noteId }) => {
		try {
			const researchDir = getResearchDir();

			// Ensure directory exists
			if (!existsSync(researchDir)) {
				await mkdir(researchDir, { recursive: true });
			}

			const now = new Date().toISOString();
			const id = noteId || generateNoteId(topic);
			const notePath = join(researchDir, `${id}.json`);

			let note: ResearchNote;
			if (noteId && existsSync(notePath)) {
				// Update existing note
				const existing = JSON.parse(await readFile(notePath, 'utf-8')) as ResearchNote;
				note = {
					...existing,
					content,
					updatedAt: now,
					tags: tags || existing.tags,
				};
			} else {
				// Create new note
				note = {
					id,
					topic,
					content,
					createdAt: now,
					updatedAt: now,
					tags,
				};
			}

			await writeFile(notePath, JSON.stringify(note, null, 2), 'utf-8');

			return {
				success: true,
				noteId: id,
				path: notePath,
				action: noteId ? 'updated' : 'created',
				topic,
				contentLength: content.length,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

/**
 * Read research notes tool - read notes by topic or ID
 */
export const readResearchNotesTool = defineTool({
	name: 'read_research_notes',
	description:
		'Read research notes. Can retrieve a specific note by ID, or search for notes by topic keyword.',
	parameters: z.object({
		noteId: z.string().optional().describe('Specific note ID to read'),
		topicSearch: z.string().optional().describe('Search for notes containing this topic keyword'),
	}),
	execute: async ({ noteId, topicSearch }) => {
		try {
			const researchDir = getResearchDir();

			if (!existsSync(researchDir)) {
				return {
					success: true,
					notes: [],
					message: 'No research notes exist yet.',
				};
			}

			if (noteId) {
				// Read specific note
				const notePath = join(researchDir, `${noteId}.json`);
				if (!existsSync(notePath)) {
					return {
						success: false,
						error: `Note with ID "${noteId}" not found`,
					};
				}
				const note = JSON.parse(await readFile(notePath, 'utf-8')) as ResearchNote;
				return {
					success: true,
					notes: [note],
				};
			}

			// List and optionally filter notes
			const files = await readdir(researchDir);
			const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.startsWith('plan-'));

			const notes: ResearchNote[] = [];
			for (const file of jsonFiles) {
				const content = await readFile(join(researchDir, file), 'utf-8');
				const note = JSON.parse(content) as ResearchNote;
				if (!topicSearch || note.topic.toLowerCase().includes(topicSearch.toLowerCase())) {
					notes.push(note);
				}
			}

			// Sort by updatedAt descending
			notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

			return {
				success: true,
				noteCount: notes.length,
				notes: notes.map((n) => ({
					id: n.id,
					topic: n.topic,
					tags: n.tags,
					updatedAt: n.updatedAt,
					contentPreview: n.content.slice(0, 200) + (n.content.length > 200 ? '...' : ''),
				})),
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

/**
 * List research notes tool - list all saved research files
 */
export const listResearchNotesTool = defineTool({
	name: 'list_research_notes',
	description:
		'List all saved research notes. Returns a summary of each note including topic, tags, and date.',
	parameters: z.object({
		tag: z.string().optional().describe('Filter notes by tag'),
	}),
	execute: async ({ tag }) => {
		try {
			const researchDir = getResearchDir();

			if (!existsSync(researchDir)) {
				return {
					success: true,
					directory: researchDir,
					noteCount: 0,
					notes: [],
				};
			}

			const files = await readdir(researchDir);
			const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.startsWith('plan-'));

			const notes: Array<{
				id: string;
				topic: string;
				tags?: string[];
				createdAt: string;
				updatedAt: string;
			}> = [];

			for (const file of jsonFiles) {
				const content = await readFile(join(researchDir, file), 'utf-8');
				const note = JSON.parse(content) as ResearchNote;

				// Filter by tag if provided
				if (tag && (!note.tags || !note.tags.includes(tag))) {
					continue;
				}

				notes.push({
					id: note.id,
					topic: note.topic,
					tags: note.tags,
					createdAt: note.createdAt,
					updatedAt: note.updatedAt,
				});
			}

			// Sort by updatedAt descending
			notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

			return {
				success: true,
				directory: researchDir,
				noteCount: notes.length,
				notes,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

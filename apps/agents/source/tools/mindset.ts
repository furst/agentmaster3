import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { defineTool } from '@conductor/core';
import { getFinanceConfig } from '../config/finance-config.js';

/**
 * Read mindset tool - reads the user's investment philosophy document
 */
export const readMindsetTool = defineTool({
	name: 'read_mindset',
	description:
		"Read the user's investment mindset/philosophy document. This contains their investment principles, risk tolerance, goals, and decision-making framework. Always read this before giving investment advice to personalize recommendations.",
	parameters: z.object({}),
	execute: async () => {
		try {
			const config = getFinanceConfig();
			const mindsetPath = config.mindsetPath;

			if (!existsSync(mindsetPath)) {
				return {
					success: true,
					exists: false,
					path: mindsetPath,
					content: null,
					message:
						'No mindset file exists yet. Use save_mindset to create one, or the user can create it manually.',
				};
			}

			const content = await readFile(mindsetPath, 'utf-8');
			return {
				success: true,
				exists: true,
				path: mindsetPath,
				content,
				lineCount: content.split('\n').length,
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
 * Save mindset tool - saves or updates the user's investment philosophy
 */
export const saveMindsetTool = defineTool({
	name: 'save_mindset',
	description:
		"Save or update the user's investment mindset/philosophy document. Use this to record their investment principles, risk tolerance, goals, lessons learned, and decision-making framework. The content should be well-structured markdown.",
	parameters: z.object({
		content: z.string().describe('The mindset document content (markdown format)'),
		append: z
			.boolean()
			.optional()
			.default(false)
			.describe('If true, append to existing content instead of replacing'),
	}),
	execute: async ({ content, append }) => {
		try {
			const config = getFinanceConfig();
			const mindsetPath = config.mindsetPath;

			// Ensure directory exists
			const dir = dirname(mindsetPath);
			if (!existsSync(dir)) {
				await mkdir(dir, { recursive: true });
			}

			let finalContent = content;
			if (append && existsSync(mindsetPath)) {
				const existing = await readFile(mindsetPath, 'utf-8');
				finalContent = existing + '\n\n---\n\n' + content;
			}

			await writeFile(mindsetPath, finalContent, 'utf-8');

			return {
				success: true,
				path: mindsetPath,
				action: append ? 'appended' : 'saved',
				characterCount: finalContent.length,
				lineCount: finalContent.split('\n').length,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

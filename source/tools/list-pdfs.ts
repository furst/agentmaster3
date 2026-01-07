import { readdir, stat } from 'node:fs/promises';
import { resolve, isAbsolute, extname, join } from 'node:path';
import { z } from 'zod';
import { defineTool } from '../core/tools.js';

/**
 * List PDFs tool - lists all PDF files in a directory
 */
export const listPdfsTool = defineTool({
	name: 'list_pdfs',
	description:
		'List all PDF files in a directory. Use this to discover available newsletters or documents before reading them. Returns file names sorted by modification date (newest first).',
	parameters: z.object({
		directory: z.string().describe('The directory path to search for PDFs'),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe('Maximum number of files to return'),
	}),
	execute: async ({ directory, limit }) => {
		try {
			const resolvedDir = isAbsolute(directory)
				? directory
				: resolve(process.cwd(), directory);

			const entries = await readdir(resolvedDir, { withFileTypes: true });

			const pdfFiles: Array<{
				name: string;
				path: string;
				modifiedAt: string;
				sizeBytes: number;
			}> = [];

			for (const entry of entries) {
				if (entry.isFile() && extname(entry.name).toLowerCase() === '.pdf') {
					const filePath = join(resolvedDir, entry.name);
					const stats = await stat(filePath);
					pdfFiles.push({
						name: entry.name,
						path: filePath,
						modifiedAt: stats.mtime.toISOString(),
						sizeBytes: stats.size,
					});
				}
			}

			// Sort by modification date (newest first)
			pdfFiles.sort(
				(a, b) =>
					new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
			);

			return {
				success: true,
				directory: resolvedDir,
				count: pdfFiles.length,
				files: pdfFiles.slice(0, limit),
			};
		} catch (error) {
			const err = error as NodeJS.ErrnoException;

			if (err.code === 'ENOENT') {
				return {
					success: false,
					error: `Directory not found: ${directory}`,
					directory,
				};
			}

			if (err.code === 'EACCES') {
				return {
					success: false,
					error: `Permission denied: ${directory}`,
					directory,
				};
			}

			return {
				success: false,
				error: `Failed to list PDFs: ${err.message}`,
				directory,
			};
		}
	},
});

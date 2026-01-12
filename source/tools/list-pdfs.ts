import { readdir, stat } from 'node:fs/promises';
import { resolve, isAbsolute, extname, join } from 'node:path';
import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { toolSuccess, handleFileError } from '../core/tool-errors.js';

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

			return toolSuccess({
				directory: resolvedDir,
				count: pdfFiles.length,
				files: pdfFiles.slice(0, limit),
			});
		} catch (error) {
			return handleFileError(error, { directory });
		}
	},
});

import { readFile, stat } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { z } from 'zod';
import { defineTool } from '../core/tools.js';

/**
 * Read file tool - reads contents of a local file
 */
export const readFileTool = defineTool({
	name: 'read_file',
	description: 'Read the contents of a local file. Returns the file content, path, and size.',
	parameters: z.object({
		path: z.string().describe('The path to the file to read. Can be absolute or relative to current working directory.'),
		encoding: z
			.enum(['utf-8', 'utf8', 'ascii', 'base64', 'hex'])
			.optional()
			.default('utf-8')
			.describe('The encoding to use when reading the file. Defaults to utf-8.'),
		maxSize: z
			.number()
			.optional()
			.default(1024 * 1024) // 1MB default
			.describe('Maximum file size in bytes to read. Files larger than this will be truncated.'),
	}),
	execute: async ({ path, encoding, maxSize }) => {
		try {
			// Resolve the path
			const resolvedPath = isAbsolute(path) ? path : resolve(process.cwd(), path);

			// Check file stats first
			const stats = await stat(resolvedPath);

			if (!stats.isFile()) {
				return {
					success: false,
					error: `Path is not a file: ${resolvedPath}`,
					path: resolvedPath,
				};
			}

			const fileSize = stats.size;
			const truncated = fileSize > maxSize;

			// Read file content
			let content: string;
			if (truncated) {
				// Read only up to maxSize bytes
				const { open } = await import('node:fs/promises');
				const handle = await open(resolvedPath, 'r');
				try {
					const buffer = Buffer.alloc(maxSize);
					await handle.read(buffer, 0, maxSize, 0);
					content = buffer.toString(encoding as BufferEncoding);
				} finally {
					await handle.close();
				}
			} else {
				content = await readFile(resolvedPath, { encoding: encoding as BufferEncoding });
			}

			return {
				success: true,
				content,
				path: resolvedPath,
				size: fileSize,
				truncated,
				truncatedAt: truncated ? maxSize : undefined,
			};
		} catch (error) {
			const err = error as NodeJS.ErrnoException;

			if (err.code === 'ENOENT') {
				return {
					success: false,
					error: `File not found: ${path}`,
					path,
				};
			}

			if (err.code === 'EACCES') {
				return {
					success: false,
					error: `Permission denied: ${path}`,
					path,
				};
			}

			return {
				success: false,
				error: `Failed to read file: ${err.message}`,
				path,
			};
		}
	},
});

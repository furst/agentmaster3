import { readFile, writeFile, readdir, stat, copyFile } from 'node:fs/promises';
import { join, relative, resolve, extname, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { getObsidianConfig, type ObsidianConfig } from '../core/project-config.js';

/**
 * Validates that a path is within the vault and optionally within allowed subfolders
 */
function validatePath(
	filePath: string,
	config: ObsidianConfig
): { valid: true; resolvedPath: string } | { valid: false; error: string } {
	const vaultPath = resolve(config.vaultPath);
	const resolvedPath = resolve(vaultPath, filePath);

	// Ensure path is within vault (prevent directory traversal)
	if (!resolvedPath.startsWith(vaultPath)) {
		return {
			valid: false,
			error: `Path "${filePath}" is outside the vault directory`,
		};
	}

	// Check allowed subfolders if configured
	if (config.allowedSubfolders && config.allowedSubfolders.length > 0) {
		const relativePath = relative(vaultPath, resolvedPath);
		const inAllowedFolder = config.allowedSubfolders.some(
			(folder) =>
				relativePath.startsWith(folder + '/') || relativePath === folder
		);
		if (!inAllowedFolder) {
			return {
				valid: false,
				error: `Path "${filePath}" is not in allowed subfolders: ${config.allowedSubfolders.join(', ')}`,
			};
		}
	}

	return { valid: true, resolvedPath };
}

/**
 * Recursively lists all markdown files in a directory
 */
async function listMarkdownFiles(
	dir: string,
	baseDir: string,
	files: Array<{ name: string; path: string; modifiedAt: string; sizeBytes: number }> = []
): Promise<typeof files> {
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			// Skip hidden directories (like .obsidian, .git)
			if (!entry.name.startsWith('.')) {
				await listMarkdownFiles(fullPath, baseDir, files);
			}
		} else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
			const stats = await stat(fullPath);
			files.push({
				name: entry.name,
				path: relative(baseDir, fullPath),
				modifiedAt: stats.mtime.toISOString(),
				sizeBytes: stats.size,
			});
		}
	}

	return files;
}

/**
 * List vault notes tool - lists all markdown files in the Obsidian vault
 */
export const listVaultNotesTool = defineTool({
	name: 'list_vault_notes',
	description:
		'List all markdown notes in the Obsidian vault. Returns file names, paths relative to vault root, modification dates, and sizes. Use this to discover what notes exist before reading or writing.',
	parameters: z.object({
		subfolder: z
			.string()
			.optional()
			.describe(
				'Optional subfolder path within the vault to list. If not provided, lists all notes in the vault.'
			),
		sortBy: z
			.enum(['name', 'modified', 'size'])
			.optional()
			.default('modified')
			.describe('How to sort the results. Defaults to modified (newest first).'),
		limit: z
			.number()
			.optional()
			.default(100)
			.describe('Maximum number of files to return. Defaults to 100.'),
	}),
	execute: async ({ subfolder, sortBy, limit }) => {
		try {
			const config = getObsidianConfig();
			const vaultPath = resolve(config.vaultPath);

			// Determine search directory
			let searchDir = vaultPath;
			if (subfolder) {
				const validation = validatePath(subfolder, config);
				if (!validation.valid) {
					return { success: false, error: validation.error };
				}
				searchDir = validation.resolvedPath;
			}

			if (!existsSync(searchDir)) {
				return {
					success: false,
					error: `Directory not found: ${subfolder || 'vault root'}`,
				};
			}

			// Get all markdown files
			const files = await listMarkdownFiles(searchDir, vaultPath);

			// Sort files
			switch (sortBy) {
				case 'name':
					files.sort((a, b) => a.name.localeCompare(b.name));
					break;
				case 'size':
					files.sort((a, b) => b.sizeBytes - a.sizeBytes);
					break;
				case 'modified':
				default:
					files.sort(
						(a, b) =>
							new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
					);
			}

			// Apply limit
			const limitedFiles = files.slice(0, limit);

			return {
				success: true,
				vaultPath,
				subfolder: subfolder || null,
				count: limitedFiles.length,
				totalCount: files.length,
				files: limitedFiles,
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
 * Read vault note tool - reads content of a markdown file from the vault
 */
export const readVaultNoteTool = defineTool({
	name: 'read_vault_note',
	description:
		'Read the contents of a markdown note from the Obsidian vault. Provide a path relative to the vault root.',
	parameters: z.object({
		path: z
			.string()
			.describe(
				'Path to the markdown file relative to the vault root. Example: "daily/2024-01-15.md" or "projects/my-project.md"'
			),
	}),
	execute: async ({ path }) => {
		try {
			const config = getObsidianConfig();

			// Validate and resolve path
			const validation = validatePath(path, config);
			if (!validation.valid) {
				return { success: false, error: validation.error };
			}

			const resolvedPath = validation.resolvedPath;

			// Ensure it's a markdown file
			if (extname(resolvedPath).toLowerCase() !== '.md') {
				return {
					success: false,
					error: 'Only markdown (.md) files can be read',
				};
			}

			if (!existsSync(resolvedPath)) {
				return {
					success: false,
					error: `Note not found: ${path}`,
					path,
				};
			}

			// Check file size
			const stats = await stat(resolvedPath);
			if (stats.size > config.maxFileSizeBytes) {
				return {
					success: false,
					error: `File too large (${stats.size} bytes). Maximum: ${config.maxFileSizeBytes} bytes`,
					path,
				};
			}

			const content = await readFile(resolvedPath, 'utf-8');

			return {
				success: true,
				path,
				content,
				lineCount: content.split('\n').length,
				sizeBytes: stats.size,
				modifiedAt: stats.mtime.toISOString(),
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
 * Write vault note tool - writes or updates a markdown file in the vault
 * Includes safety measures: path validation, size limits, optional backup
 */
export const writeVaultNoteTool = defineTool({
	name: 'write_vault_note',
	description:
		'Write or update a markdown note in the Obsidian vault. Includes safety measures: path validation, size limits, and automatic backups. Use mode="append" to add content to an existing note without overwriting.',
	parameters: z.object({
		path: z
			.string()
			.describe(
				'Path for the markdown file relative to the vault root. Must end with .md. Example: "daily/2024-01-15.md"'
			),
		content: z.string().describe('The markdown content to write'),
		mode: z
			.enum(['overwrite', 'append', 'create-only'])
			.optional()
			.default('overwrite')
			.describe(
				'Write mode: "overwrite" replaces existing content, "append" adds to end, "create-only" fails if file exists'
			),
		appendSeparator: z
			.string()
			.optional()
			.default('\n\n---\n\n')
			.describe('Separator to use when appending content. Defaults to horizontal rule.'),
	}),
	execute: async ({ path, content, mode, appendSeparator }) => {
		try {
			const config = getObsidianConfig();

			// Validate and resolve path
			const validation = validatePath(path, config);
			if (!validation.valid) {
				return { success: false, error: validation.error };
			}

			const resolvedPath = validation.resolvedPath;

			// Ensure it's a markdown file
			if (extname(resolvedPath).toLowerCase() !== '.md') {
				return {
					success: false,
					error: 'Only markdown (.md) files can be written. Path must end with .md',
				};
			}

			// Check content size
			const contentSize = Buffer.byteLength(content, 'utf-8');
			if (contentSize > config.maxWriteSizeBytes) {
				return {
					success: false,
					error: `Content too large (${contentSize} bytes). Maximum: ${config.maxWriteSizeBytes} bytes`,
				};
			}

			const fileExists = existsSync(resolvedPath);

			// Handle create-only mode
			if (mode === 'create-only' && fileExists) {
				return {
					success: false,
					error: `File already exists: ${path}. Use mode="overwrite" or mode="append" to modify existing files.`,
				};
			}

			let finalContent = content;
			let action = 'created';

			// Handle existing file
			if (fileExists) {
				// Create backup if configured
				if (config.backupOnWrite) {
					const backupPath = resolvedPath + '.bak';
					await copyFile(resolvedPath, backupPath);
				}

				if (mode === 'append') {
					const existingContent = await readFile(resolvedPath, 'utf-8');
					finalContent = existingContent + appendSeparator + content;
					action = 'appended';
				} else {
					action = 'updated';
				}
			}

			// Final size check after potential append
			const finalSize = Buffer.byteLength(finalContent, 'utf-8');
			if (finalSize > config.maxFileSizeBytes) {
				return {
					success: false,
					error: `Final content would be too large (${finalSize} bytes). Maximum: ${config.maxFileSizeBytes} bytes`,
				};
			}

			// Ensure parent directory exists
			const parentDir = dirname(resolvedPath);
			if (!existsSync(parentDir)) {
				const { mkdir } = await import('node:fs/promises');
				await mkdir(parentDir, { recursive: true });
			}

			// Write the file
			await writeFile(resolvedPath, finalContent, 'utf-8');

			return {
				success: true,
				path,
				action,
				sizeBytes: finalSize,
				lineCount: finalContent.split('\n').length,
				backupCreated: fileExists && config.backupOnWrite,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

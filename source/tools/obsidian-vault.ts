import { readFile, writeFile, readdir, stat, copyFile } from 'node:fs/promises';
import { join, relative, resolve, extname, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import Fuse from 'fuse.js';
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
 * Infers tags based on content and path
 */
function inferTags(content: string, path: string): string[] {
	const tags: string[] = ['idea', 'agent']; // Always add these tags
	const contentLower = content.toLowerCase();
	const pathLower = path.toLowerCase();

	// Recipe detection
	if (
		pathLower.includes('recipe') ||
		pathLower.includes('cook') ||
		contentLower.includes('ingredients') ||
		contentLower.includes('instructions') ||
		contentLower.includes('servings') ||
		contentLower.includes('prep time') ||
		contentLower.includes('cook time')
	) {
		tags.push('cooking', 'recipe');
	}

	// Guide/tutorial detection
	if (
		pathLower.includes('guide') ||
		pathLower.includes('tutorial') ||
		pathLower.includes('how-to') ||
		contentLower.includes('step 1') ||
		contentLower.includes('## steps')
	) {
		tags.push('guide');
	}

	// Tech/code detection
	if (
		contentLower.includes('```') ||
		contentLower.includes('function') ||
		contentLower.includes('const ') ||
		contentLower.includes('import ')
	) {
		tags.push('tech', 'code');
	}

	return [...new Set(tags)]; // Remove duplicates
}

/**
 * Generates frontmatter for a new note
 */
function generateFrontmatter(tags: string[], type?: string): string {
	const tagLines = tags.map(t => `  - ${t}`).join('\n');
	return `---
tags:
${tagLines}
status:
type: ${type || ''}
---

`;
}

/**
 * Write vault note tool - writes or updates a markdown file in the vault
 * Includes safety measures: path validation, size limits, optional backup
 */
export const writeVaultNoteTool = defineTool({
	name: 'write_vault_note',
	description:
		'Write or update a markdown note in the Obsidian vault. New notes automatically get frontmatter with tags inferred from content. Includes safety measures: path validation, size limits, and automatic backups. Use mode="append" to add content to an existing note without overwriting.',
	parameters: z.object({
		path: z
			.string()
			.describe(
				'Path for the markdown file relative to the vault root. Must end with .md. Example: "recipes/chocolate-cake.md"'
			),
		content: z.string().describe('The markdown content to write (without frontmatter - it will be added automatically for new files)'),
		mode: z
			.enum(['overwrite', 'append', 'create-only'])
			.optional()
			.default('overwrite')
			.describe(
				'Write mode: "overwrite" replaces existing content, "append" adds to end, "create-only" fails if file exists'
			),
		tags: z
			.array(z.string())
			.optional()
			.describe('Optional explicit tags to add. If not provided, tags are inferred from content.'),
		type: z
			.string()
			.optional()
			.describe('Optional type field for frontmatter (e.g., "recipe", "guide", "reference")'),
		appendSeparator: z
			.string()
			.optional()
			.default('\n\n---\n\n')
			.describe('Separator to use when appending content. Defaults to horizontal rule.'),
		skipFrontmatter: z
			.boolean()
			.optional()
			.default(false)
			.describe('Skip adding frontmatter (useful for raw content or when frontmatter already exists)'),
	}),
	execute: async ({ path, content, mode, tags, type, appendSeparator, skipFrontmatter }) => {
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
			let appliedTags: string[] = [];

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
			} else if (!skipFrontmatter) {
				// New file - add frontmatter and references section
				appliedTags = tags ?? inferTags(content, path);
				const frontmatter = generateFrontmatter(appliedTags, type);
				const referencesSection = '\n\n---\n# References\n';
				finalContent = frontmatter + content + referencesSection;
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
				tags: appliedTags.length > 0 ? appliedTags : undefined,
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
 * Search vault tool - searches note contents for matching text
 * Supports multi-word AND search with fuzzy matching
 */
export const searchVaultTool = defineTool({
	name: 'search_vault',
	description:
		'Search through the contents of all markdown notes in the Obsidian vault. Supports fuzzy matching and multi-word queries (all words must match). Returns matching files ranked by relevance.',
	parameters: z.object({
		query: z
			.string()
			.describe('The search query. Multiple words are AND-ed together. Supports fuzzy matching for typos/variations.'),
		subfolder: z
			.string()
			.optional()
			.describe('Optional subfolder to limit the search scope.'),
		fuzzyThreshold: z
			.number()
			.optional()
			.default(0.4)
			.describe('Fuzzy match threshold 0-1. Lower = more fuzzy. 0.4 is default, 0 = exact match only.'),
		maxResults: z
			.number()
			.optional()
			.default(20)
			.describe('Maximum number of matching files to return. Defaults to 20.'),
	}),
	execute: async ({ query, subfolder, fuzzyThreshold, maxResults }) => {
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

			// Split query into words for AND matching
			const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);

			if (queryWords.length === 0) {
				return {
					success: false,
					error: 'Query cannot be empty',
				};
			}

			const results: Array<{
				path: string;
				name: string;
				score: number;
				matchedWords: string[];
				preview: string;
			}> = [];

			// Search through each file
			for (const file of files) {
				const fullPath = join(vaultPath, file.path);

				// Skip files that are too large
				if (file.sizeBytes > config.maxFileSizeBytes) {
					continue;
				}

				try {
					const content = await readFile(fullPath, 'utf-8');

					// Create searchable items from the content
					// We'll search the entire content as one item, plus individual lines
					const contentLower = content.toLowerCase();
					const lines = content.split('\n');

					// Create Fuse instance for this file's content
					// Search against individual words in the content
					const contentWords = contentLower.split(/\s+/).filter(w => w.length > 2);
					const uniqueWords = [...new Set(contentWords)];

					const fuse = new Fuse(uniqueWords, {
						threshold: fuzzyThreshold,
						includeScore: true,
					});

					// Check if ALL query words match (AND logic)
					const matchedWords: string[] = [];
					let totalScore = 0;
					let allWordsMatch = true;

					for (const queryWord of queryWords) {
						// First try exact substring match
						if (contentLower.includes(queryWord)) {
							matchedWords.push(queryWord);
							totalScore += 0; // Perfect score
						} else {
							// Try fuzzy match
							const fuseResults = fuse.search(queryWord);
							if (fuseResults.length > 0 && fuseResults[0]) {
								matchedWords.push(`${queryWord}~${fuseResults[0].item}`);
								totalScore += fuseResults[0].score ?? 0;
							} else {
								allWordsMatch = false;
								break;
							}
						}
					}

					if (allWordsMatch) {
						// Find a preview line that contains as many query words as possible
						let bestPreviewLine = '';
						let bestPreviewScore = -1;

						for (const line of lines) {
							const lineLower = line.toLowerCase();
							let lineScore = 0;
							for (const word of queryWords) {
								if (lineLower.includes(word)) {
									lineScore++;
								}
							}
							if (lineScore > bestPreviewScore) {
								bestPreviewScore = lineScore;
								bestPreviewLine = line.trim();
							}
						}

						results.push({
							path: file.path,
							name: file.name,
							score: totalScore / queryWords.length,
							matchedWords,
							preview: bestPreviewLine.slice(0, 200) + (bestPreviewLine.length > 200 ? '...' : ''),
						});
					}
				} catch {
					// Skip files that can't be read
					continue;
				}
			}

			// Sort by score (lower is better for Fuse.js)
			results.sort((a, b) => a.score - b.score);

			// Apply limit
			const limitedResults = results.slice(0, maxResults);

			return {
				success: true,
				query,
				queryWords,
				subfolder: subfolder || null,
				resultCount: limitedResults.length,
				totalMatches: results.length,
				results: limitedResults,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

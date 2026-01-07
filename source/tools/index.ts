/**
 * Tool registry - exports all available tools
 */

export { readFileTool } from './read-file.js';
export { webSearchTool } from './web-search.js';
export { exaSearchTool, exaGetContentsTool } from './exa-search.js';
export { jinaReaderTool } from './jina-reader.js';

import { readFileTool } from './read-file.js';
import { webSearchTool } from './web-search.js';
import { exaSearchTool, exaGetContentsTool } from './exa-search.js';
import { jinaReaderTool } from './jina-reader.js';
import { createToolsRecord } from '../core/tools.js';

/**
 * All available tools as an array
 */
export const allTools = [readFileTool, webSearchTool, exaSearchTool, exaGetContentsTool, jinaReaderTool];

/**
 * All available tools as a record for passing to the LLM
 */
export const allToolsRecord = createToolsRecord(allTools);

/**
 * Tool categories for organizing tools by purpose
 */
export const toolCategories = {
	filesystem: [readFileTool],
	web: [webSearchTool, exaSearchTool, exaGetContentsTool, jinaReaderTool],
} as const;

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof toolCategories) {
	return createToolsRecord([...toolCategories[category]]);
}

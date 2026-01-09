/**
 * Tool registry - exports all available tools
 */

export { readFileTool } from './read-file.js';
export { webSearchTool } from './web-search.js';
export { exaSearchTool, exaGetContentsTool } from './exa-search.js';
export { jinaReaderTool } from './jina-reader.js';
export { listPdfsTool } from './list-pdfs.js';
export { readPdfTool } from './read-pdf.js';
export { readMindsetTool, saveMindsetTool } from './mindset.js';
export { listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool, searchVaultTool } from './obsidian-vault.js';
export { parseHoldingsImageTool, readHoldingsTool, listHoldingsImagesTool } from './holdings.js';

import { readFileTool } from './read-file.js';
import { webSearchTool } from './web-search.js';
import { exaSearchTool, exaGetContentsTool } from './exa-search.js';
import { jinaReaderTool } from './jina-reader.js';
import { listPdfsTool } from './list-pdfs.js';
import { readPdfTool } from './read-pdf.js';
import { readMindsetTool, saveMindsetTool } from './mindset.js';
import { listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool, searchVaultTool } from './obsidian-vault.js';
import { parseHoldingsImageTool, readHoldingsTool, listHoldingsImagesTool } from './holdings.js';
import { createToolsRecord } from '../core/tools.js';

/**
 * All available tools as an array
 */
export const allTools = [
	readFileTool,
	webSearchTool,
	exaSearchTool,
	exaGetContentsTool,
	jinaReaderTool,
	listPdfsTool,
	readPdfTool,
	readMindsetTool,
	saveMindsetTool,
	listVaultNotesTool,
	readVaultNoteTool,
	writeVaultNoteTool,
	searchVaultTool,
	parseHoldingsImageTool,
	readHoldingsTool,
	listHoldingsImagesTool,
];

/**
 * All available tools as a record for passing to the LLM
 */
export const allToolsRecord = createToolsRecord(allTools);

/**
 * Tool categories for organizing tools by purpose
 */
export const toolCategories = {
	filesystem: [readFileTool, listPdfsTool, readPdfTool],
	web: [webSearchTool, exaSearchTool, exaGetContentsTool, jinaReaderTool],
	finance: [listPdfsTool, readPdfTool, readMindsetTool, saveMindsetTool, parseHoldingsImageTool, readHoldingsTool, listHoldingsImagesTool],
	obsidian: [listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool, searchVaultTool],
} as const;

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof toolCategories) {
	return createToolsRecord([...toolCategories[category]]);
}

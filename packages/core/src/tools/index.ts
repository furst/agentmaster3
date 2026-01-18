/**
 * Framework tool registry - exports general-purpose tools
 */

// File tools
export { readFileTool } from './read-file.js';
export { listPdfsTool } from './list-pdfs.js';
export { readPdfTool } from './read-pdf.js';

// Web tools (Exa-based)
export { webSearchTool, webFetchTool, webResearchTool, webAnswerTool } from './web.js';

// Live web fetching (Jina Reader - for current/live content)
export { jinaReaderTool } from './jina-reader.js';

// Vault tools
export { listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool, searchVaultTool } from './obsidian-vault.js';

// Memory tool
export { saveMemoryTool } from './memory.js';

// User interaction tools
export {
	askUserQuestionTool,
	askUserEvents,
	sendAnswer,
	getPendingQuestion,
	type QuestionEvent,
	type AnswerEvent,
	type QuestionOption,
} from './ask-user-question.js';

// Plan mode tools
export {
	enterPlanModeTool,
	exitPlanModeTool,
	planModeEvents,
	isInPlanMode,
	getCurrentPlanId,
	sendPlanApproval,
	forcePlanModeExit,
	type PlanModeEnterEvent,
	type PlanModeExitEvent,
	type PlanModeApprovalEvent,
} from './plan-mode.js';

// Session todo tools
export { createTodosTool, updateTodoTool, getTodosTool, clearTodosTool } from './session-todo.js';

// ============================================================================
// Tool imports for collections
// ============================================================================

import { readFileTool } from './read-file.js';
import { listPdfsTool } from './list-pdfs.js';
import { readPdfTool } from './read-pdf.js';
import { webSearchTool, webFetchTool, webResearchTool, webAnswerTool } from './web.js';
import { jinaReaderTool } from './jina-reader.js';
import { listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool, searchVaultTool } from './obsidian-vault.js';
import { saveMemoryTool } from './memory.js';
import { askUserQuestionTool } from './ask-user-question.js';
import { enterPlanModeTool, exitPlanModeTool } from './plan-mode.js';
import { createTodosTool, updateTodoTool, getTodosTool, clearTodosTool } from './session-todo.js';
import { createToolsRecord } from '../core/tools.js';

/**
 * All framework tools as an array
 */
export const frameworkTools = [
	// File tools
	readFileTool,
	listPdfsTool,
	readPdfTool,
	// Web tools (Exa)
	webSearchTool,
	webFetchTool,
	webResearchTool,
	webAnswerTool,
	// Live web fetching (Jina)
	jinaReaderTool,
	// Vault tools
	listVaultNotesTool,
	readVaultNoteTool,
	writeVaultNoteTool,
	searchVaultTool,
	// Memory tool
	saveMemoryTool,
	// User interaction
	askUserQuestionTool,
	// Plan mode
	enterPlanModeTool,
	exitPlanModeTool,
	// Session todos
	createTodosTool,
	updateTodoTool,
	getTodosTool,
	clearTodosTool,
];

/**
 * All framework tools as a record for passing to the LLM
 */
export const frameworkToolsRecord = createToolsRecord(frameworkTools);

/**
 * Tool categories for organizing tools by purpose
 */
export const toolCategories = {
	filesystem: [readFileTool, listPdfsTool, readPdfTool],
	web: [webSearchTool, webFetchTool, webResearchTool, webAnswerTool, jinaReaderTool],
	vault: [listVaultNotesTool, readVaultNoteTool, writeVaultNoteTool, searchVaultTool],
	memory: [saveMemoryTool],
	interaction: [askUserQuestionTool],
	planning: [enterPlanModeTool, exitPlanModeTool],
	productivity: [createTodosTool, updateTodoTool, getTodosTool, clearTodosTool],
} as const;

/**
 * Read-only tools for sub-agents (explore, plan)
 * Does not include write operations
 */
export const readOnlyTools = [
	// File reading
	readFileTool,
	listPdfsTool,
	readPdfTool,
	// Web (all are read-only)
	webSearchTool,
	webFetchTool,
	webResearchTool,
	webAnswerTool,
	jinaReaderTool,
	// Vault (read-only subset)
	listVaultNotesTool,
	readVaultNoteTool,
	searchVaultTool,
];

/**
 * Read-only tools as a record
 */
export const readOnlyToolsRecord = createToolsRecord(readOnlyTools);

/**
 * Get tools by category
 */
export function getToolsByCategory(category: keyof typeof toolCategories) {
	return createToolsRecord([...toolCategories[category]]);
}

/**
 * Get all read-only tools (for sub-agents)
 */
export function getReadOnlyTools() {
	return readOnlyTools;
}

/**
 * Personal agent tools - exports domain-specific tools
 * 
 * These tools extend the framework tools with finance-specific functionality.
 */

// Re-export framework tools
export * from '@conductor/core/tools';

// Finance-specific tools
export { financialMetricsSnapshotTool } from './financial-datasets.js';
export { financialStatementsTool } from './financial-datasets.js';
export { stockPricesTool } from './financial-datasets.js';
export { insiderTradesTool } from './financial-datasets.js';
export { institutionalOwnershipTool } from './financial-datasets.js';
export { earningsPressReleasesTool } from './financial-datasets.js';
export { secFilingItemsTool } from './financial-datasets.js';

// Investment philosophy tools
export { readMindsetTool, saveMindsetTool } from './mindset.js';

// Portfolio tracking tools
export { parseHoldingsImageTool, readHoldingsTool } from './holdings.js';


// ============================================================================
// Tool Collections
// ============================================================================

import {
	getReadOnlyTools,
	createToolsRecord,
} from '@conductor/core';

import {
	financialMetricsSnapshotTool,
	financialStatementsTool,
	stockPricesTool,
	insiderTradesTool,
	institutionalOwnershipTool,
	earningsPressReleasesTool,
	secFilingItemsTool,
} from './financial-datasets.js';

import { readMindsetTool, saveMindsetTool } from './mindset.js';
import { parseHoldingsImageTool, readHoldingsTool } from './holdings.js';

/**
 * All finance-related tools
 */
export const financeTools = [
	// Financial data API tools
	financialMetricsSnapshotTool,
	financialStatementsTool,
	stockPricesTool,
	insiderTradesTool,
	institutionalOwnershipTool,
	earningsPressReleasesTool,
	secFilingItemsTool,
	// Investment philosophy
	readMindsetTool,
	saveMindsetTool,
	// Portfolio
	parseHoldingsImageTool,
	readHoldingsTool,
];

/**
 * All finance tools as a record
 */
export const financeToolsRecord = createToolsRecord(financeTools);

/**
 * Read-only tools extended with finance read tools
 * Used for sub-agents that need to research but not modify
 */
export const extendedReadOnlyTools = [
	...getReadOnlyTools(),
	// Finance read-only tools
	readMindsetTool,
	readHoldingsTool,
	// Financial data (all are read-only)
	financialMetricsSnapshotTool,
	financialStatementsTool,
	stockPricesTool,
	insiderTradesTool,
	institutionalOwnershipTool,
	earningsPressReleasesTool,
	secFilingItemsTool,
];

/**
 * Extended read-only tools as a record
 */
export const extendedReadOnlyToolsRecord = createToolsRecord(extendedReadOnlyTools);

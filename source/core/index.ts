/**
 * Core module exports
 */

export {
	getConfig,
	getApiKey,
	getAgentConfig,
	clearConfigCache,
	CONFIG_PATH,
	CONFIG_DIR,
} from './config.js';
export type { Config, AgentConfig } from './config.js';

export {
	createAnthropicProvider,
	createModel,
	streamResponse,
	generateResponse,
} from './llm.js';
export type {
	CoreMessage,
	CoreTool,
	StreamOptions,
	GenerateOptions,
	StepFinishEvent,
	ToolCallResult,
	ToolResultEntry,
} from './llm.js';

export { defineTool, createToolsRecord } from './tools.js';
export type { ToolDefinition, ToolContext } from './tools.js';

export { createAgent, useAgent } from './agent.js';
export type {
	AgentConfig as CreateAgentConfig,
	Message,
	ToolCallEvent,
	AgentState,
	AgentEvent,
	AgentEventType,
	AgentEventHandler,
	Agent,
} from './agent.js';

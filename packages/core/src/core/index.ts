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
	AgentSession,
} from './agent.js';

export { agentEvents, generateProcessId, filterByProcess, createAgentEventBus } from './events.js';
export type { AgentEventEmitter, AgentBusEvent, AgentEventType as BusEventType } from './events.js';

export {
	getProjectConfig,
	getProjectConfigPath,
	getModelsConfig,
	getObsidianConfig,
	getMemoryConfig,
	registerConfigSection,
	getConfigSection,
	registerAppConfig,
	clearProjectConfigCache,
	registerObsidianHooks,
	getObsidianHooks,
	clearObsidianHooks,
	ModelsConfigSchema,
	ObsidianConfigSchema,
	MemoryConfigSchema,
} from './project-config.js';
export type {
	ModelsConfig,
	ObsidianConfig,
	MemoryConfig,
	BaseProjectConfig,
	ValidatedModelsConfig,
	ObsidianTagInferenceFunction,
	ObsidianFrontmatterGenerator,
} from './project-config.js';

export {
	saveSession,
	loadSession,
	deleteSession,
	listSessions,
	getSessionInfo,
	getAgentNames,
	sessionExists,
	getStorageSize,
	formatRelativeTime,
	formatDate,
} from './session-manager.js';
export type { SessionInfo } from './session-manager.js';

export {
	loadTodos,
	saveTodos,
	createTodos,
	updateTodoStatus,
	clearTodos,
	getTodoProgress,
	generateTodoId,
} from './session-todo.js';
export type { TodoItem, TodoList } from './session-todo.js';

export {
	loadPlan,
	savePlan,
	createPlan,
	updatePlan,
	approvePlan,
	startPlanExecution,
	cancelPlan,
	clearPlan,
	parsePlanFromText,
	generateStepId,
} from './session-plan.js';
export type { Plan, PlanStep, ApprovedPlanResult } from './session-plan.js';

export { usePlanMode, PLAN_PROMPT_MARKERS, isPlanningMessage } from './plan-mode.js';

export { useAgentTimeline } from './timeline.js';
export type { TimelineEntry, TimelineEntryType, SubAgentData, SubAgentToolCall } from './timeline.js';

export { createTaskTool } from './task-tool.js';
export { createSubAgentTool } from './sub-agent.js';
export { filterToolsForAgentType, buildAgentSystemPrompt } from './agent-types.js';
export type { AgentType } from './agent-types.js';

export { buildOrchestratorPrompt } from './orchestrator-prompt.js';

export { useAgentCommand, commandOptions } from './command-helpers.js';
export type { CommandProps, CommandOptions } from './command-helpers.js';

export { loadAgentMemory as loadMemory, saveAgentMemory as saveMemory, buildMemoryPromptSection as buildMemoryPrompt } from './memory.js';

export {
	toolError,
	toolSuccess,
	handleFileError,
	handleNetworkError,
	withErrorHandling,
} from './tool-errors.js';
export type { ToolErrorResult, ToolSuccessResult, ToolResult } from './tool-errors.js';

export { createMultiModel, parseModelSpec, generateWithModel } from './multi-model.js';
export type { Provider, ModelSpec } from './multi-model.js';

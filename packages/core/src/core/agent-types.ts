/**
 * Agent Type Definitions
 *
 * Defines the available agent types for the Task tool.
 * Each type has a specific set of tools and use case.
 */

import { z } from 'zod';
import { type CoreTool } from './llm.js';
import { getModelsConfig } from './project-config.js';

// ============================================================================
// Agent Type Schema
// ============================================================================

export const AgentTypeSchema = z.enum(['explore', 'plan']);
export type AgentType = z.infer<typeof AgentTypeSchema>;

// ============================================================================
// Agent Type Configuration
// ============================================================================

export interface AgentTypeConfig {
	/** Human-readable description of when to use this agent */
	description: string;
	/** System prompt for the agent */
	systemPrompt: string;
	/** List of tool names available to this agent */
	toolNames: string[];
	/** Default model for this agent type ('light' or 'strong') */
	defaultModel: 'light' | 'strong';
	/** Maximum number of agent turns/steps */
	maxTurns: number;
}

// ============================================================================
// Default Agent Type Configurations
// ============================================================================

const EXPLORE_AGENT_CONFIG: AgentTypeConfig = {
	description: 'Fast exploration agent for research, searching, and information gathering. Read-only tools only.',
	systemPrompt: `You are an exploration agent. Your job is to efficiently find and gather information.

You have access to read-only tools for:
- Web search and content fetching
- File reading
- Vault/notes searching

Your goal is to:
1. Understand the exploration task
2. Use appropriate tools to gather information
3. Synthesize findings into a clear summary

Be thorough but efficient. Report what you found, including specific details, file paths, and relevant quotes.`,
	toolNames: [
		// Web tools
		'web_search',
		'web_fetch',
		'web_research',
		'web_answer',
		// File tools
		'read_file',
		'list_pdfs',
		'read_pdf',
		// Vault tools (read-only)
		'list_vault_notes',
		'read_vault_note',
		'search_vault',
	],
	defaultModel: 'light',
	maxTurns: 10,
};

const PLAN_AGENT_CONFIG: AgentTypeConfig = {
	description: 'Planning agent for designing implementation approaches. Can ask clarifying questions.',
	systemPrompt: `You are a planning agent. Your job is to design clear, actionable implementation plans.

You have access to:
- All read-only tools (search, read, fetch)
- ask_user_question tool for clarifying requirements

Your goal is to:
1. Understand the task requirements
2. Explore relevant code/data to inform your plan
3. Ask clarifying questions if needed
4. Design a concrete implementation approach
5. Return a clear plan with specific steps

Your plan should include:
- Clear objective
- Specific steps (not vague - reference actual files/data)
- Key files that need modification
- Potential challenges or considerations`,
	toolNames: [
		// Web tools
		'web_search',
		'web_fetch',
		'web_research',
		'web_answer',
		// File tools
		'read_file',
		'list_pdfs',
		'read_pdf',
		// Vault tools (read-only)
		'list_vault_notes',
		'read_vault_note',
		'search_vault',
		// Plan-specific
		'ask_user_question',
	],
	defaultModel: 'light',
	maxTurns: 15,
};

// ============================================================================
// Agent Type Registry
// ============================================================================

const agentTypeConfigs: Record<AgentType, AgentTypeConfig> = {
	explore: EXPLORE_AGENT_CONFIG,
	plan: PLAN_AGENT_CONFIG,
};

/**
 * Get configuration for an agent type
 */
export function getAgentTypeConfig(type: AgentType): AgentTypeConfig {
	return agentTypeConfigs[type];
}

/**
 * Get all available agent types
 */
export function getAvailableAgentTypes(): AgentType[] {
	return Object.keys(agentTypeConfigs) as AgentType[];
}

/**
 * Resolve model for an agent type
 * Uses project config for actual model strings
 */
export function resolveAgentModel(type: AgentType, override?: 'light' | 'strong'): string {
	const config = agentTypeConfigs[type];
	const modelType = override ?? config.defaultModel;
	const modelsConfig = getModelsConfig();

	return modelType === 'strong' ? modelsConfig.strong : modelsConfig.light;
}

/**
 * Wrap a tool with timing measurement.
 * The result will include __timing with startTime, endTime, and durationMs.
 */
function wrapToolWithTiming(tool: CoreTool): CoreTool {
	const originalExecute = tool.execute;
	if (!originalExecute) {
		return tool;
	}

	return {
		...tool,
		execute: async (args, options) => {
			const startTime = Date.now();
			const result = await originalExecute(args, options);
			const endTime = Date.now();

			// Embed timing in result (will be extracted by task-tool.ts)
			if (result && typeof result === 'object') {
				return {
					...(result as object),
					__timing: {
						startTime,
						endTime,
						durationMs: endTime - startTime,
					},
				};
			}

			return result;
		},
	};
}

/**
 * Filter tools based on agent type's allowed tools.
 * Also wraps tools with timing measurement.
 */
export function filterToolsForAgentType(
	type: AgentType,
	availableTools: Record<string, CoreTool>
): Record<string, CoreTool> {
	const config = agentTypeConfigs[type];
	const filtered: Record<string, CoreTool> = {};

	for (const toolName of config.toolNames) {
		if (availableTools[toolName]) {
			// Wrap with timing measurement
			filtered[toolName] = wrapToolWithTiming(availableTools[toolName]!);
		}
	}

	return filtered;
}

/**
 * Build system prompt for an agent type
 * Can be customized with additional context
 */
export function buildAgentSystemPrompt(type: AgentType, additionalContext?: string): string {
	const config = agentTypeConfigs[type];
	let prompt = config.systemPrompt;

	if (additionalContext) {
		prompt += `\n\n--- Additional Context ---\n${additionalContext}`;
	}

	return prompt;
}

/**
 * Command Helpers
 *
 * Shared utilities and types for command files to reduce boilerplate.
 */

import { useMemo } from 'react';
import { z } from 'zod';
import { createAgent, type AgentConfig } from './agent.js';
import { createToolsRecord, type CoreTool } from './tools.js';

// ============================================================================
// Shared Types & Schema
// ============================================================================

/**
 * Common options schema for all command files
 * All commands accept an optional initial prompt
 */
export const commandOptions = z.object({
	prompt: z.string().optional().describe('Initial prompt to send'),
});

export type CommandOptions = z.infer<typeof commandOptions>;

export interface CommandProps {
	options: CommandOptions;
}

// ============================================================================
// Agent Setup Hook
// ============================================================================

export interface SubAgentFactory {
	(): { name: string; tool: CoreTool };
}

export interface UseAgentCommandConfig {
	/** Agent name (used for memory, session ID, etc.) */
	name: string;
	/** System prompt builder function */
	buildSystemPrompt: () => string;
	/** Model to use */
	model: string;
	/** Direct tools (not sub-agents) */
	tools?: Array<{ name: string; tool: CoreTool }>;
	/** Sub-agent factory functions */
	subAgents?: SubAgentFactory[];
	/** Max iterations (default: 10) */
	maxIterations?: number;
	/** Reasoning config */
	reasoning?: AgentConfig['reasoning'];
}

/**
 * Hook that handles the common pattern of creating an agent with sub-agents.
 * Properly memoizes sub-agents and the main agent.
 *
 * @example
 * const agent = useAgentCommand({
 *   name: 'ask',
 *   buildSystemPrompt,
 *   model: modelsConfig.light,
 *   tools: [saveMemoryTool],
 *   subAgents: [createVaultAgent, createWebResearchAgent],
 * });
 */
export function useAgentCommand(config: UseAgentCommandConfig) {
	const {
		name,
		buildSystemPrompt,
		model,
		tools = [],
		subAgents = [],
		maxIterations,
		reasoning,
	} = config;

	// Memoize sub-agents - they're created once per mount
	const memoizedSubAgents = useMemo(() => {
		return subAgents.map((factory) => factory());
	}, []);  // eslint-disable-line react-hooks/exhaustive-deps

	// Memoize the main agent
	const agent = useMemo(() => {
		const allTools = [...tools, ...memoizedSubAgents];

		return createAgent({
			name,
			systemPrompt: buildSystemPrompt(),
			model,
			tools: createToolsRecord(allTools),
			maxIterations,
			reasoning,
		});
	}, [name, model, maxIterations, reasoning?.enabled, reasoning?.budgetTokens, memoizedSubAgents, buildSystemPrompt, tools]);

	return agent;
}

// ============================================================================
// AgentShell Props Builder
// ============================================================================

export interface AgentShellConfig {
	/** Display name shown in header */
	displayName: string;
	/** Accent color for UI */
	color: string;
	/** Input placeholder text */
	placeholder: string;
	/** Welcome message shown before first interaction */
	welcomeMessage: string;
}

/**
 * Helper to build consistent AgentShell props
 */
export function buildShellProps(
	config: AgentShellConfig,
	initialPrompt?: string
) {
	return {
		name: config.displayName,
		color: config.color,
		placeholder: config.placeholder,
		welcomeMessage: config.welcomeMessage,
		initialPrompt,
	};
}

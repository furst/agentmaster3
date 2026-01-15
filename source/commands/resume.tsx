/**
 * Resume Command
 *
 * Lists saved sessions and allows resuming a previous conversation.
 * Usage: agentmaster resume [--agent <name>]
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { z } from 'zod';
import {
	listSessions,
	loadSession,
	deleteSession,
	formatRelativeTime,
	getAgentNames,
	type SessionInfo,
} from '../core/session-manager.js';
import { AgentShell } from '../components/AgentShell.js';
import { createAgent } from '../core/agent.js';
import { createToolsRecord } from '../core/tools.js';
import { getModelsConfig } from '../core/project-config.js';
import { buildOrchestratorPrompt } from '../core/orchestrator-prompt.js';
import { buildMemoryPromptSection } from '../core/memory.js';

// Agent-specific imports
import { saveMemoryTool } from '../tools/memory.js';
import { exaGetContentsTool } from '../tools/exa-search.js';
import { createVaultAgent } from '../agents/vault-agent.js';
import { createWebResearchAgent } from '../agents/web-research-agent.js';

// ============================================================================
// Options Schema
// ============================================================================

export const options = z.object({
	agent: z.string().optional().describe('Filter sessions by agent name'),
});

type ResumeOptions = z.infer<typeof options>;

// ============================================================================
// Agent Configuration Registry
// ============================================================================

interface AgentSetup {
	displayName: string;
	color: string;
	placeholder: string;
	welcomeMessage: string;
	buildSystemPrompt: () => string;
	tools: Array<{ name: string; tool: any }>;
	subAgents: Array<() => { name: string; tool: any }>;
	model: string;
}

/**
 * Get agent setup configuration by name
 * Add new agents here to support resuming them
 */
function getAgentSetup(agentName: string, modelsConfig: ReturnType<typeof getModelsConfig>): AgentSetup | null {
	switch (agentName) {
		case 'ask':
			return {
				displayName: 'Ask',
				color: 'cyan',
				placeholder: 'Ask me anything...',
				welcomeMessage: 'Resumed session. Continue your conversation!',
				buildSystemPrompt: () => {
					const memorySection = buildMemoryPromptSection('ask');
					return buildOrchestratorPrompt({
						role: 'You are a helpful, friendly, and knowledgeable assistant.',
						subAgents: [
							{ name: 'vault_agent', description: 'Manages Obsidian vault', useCases: [] },
							{ name: 'web_research_agent', description: 'Web search', useCases: [] },
						],
						directTools: [
							{ name: 'save_memory', description: 'Save context' },
							{ name: 'exa_get_contents', description: 'Fetch article content' },
						],
						additionalInstructions: memorySection,
					});
				},
				tools: [saveMemoryTool, exaGetContentsTool],
				subAgents: [createVaultAgent, createWebResearchAgent],
				model: modelsConfig.light,
			};

		case 'news':
			return {
				displayName: 'News',
				color: 'yellow',
				placeholder: 'What news are you looking for?',
				welcomeMessage: 'Resumed news session.',
				buildSystemPrompt: () => 'You are a news aggregation assistant.',
				tools: [],
				subAgents: [],
				model: modelsConfig.light,
			};

		case 'finance':
			return {
				displayName: 'Finance',
				color: 'green',
				placeholder: 'Ask about your portfolio...',
				welcomeMessage: 'Resumed finance session.',
				buildSystemPrompt: () => 'You are a financial assistant.',
				tools: [],
				subAgents: [],
				model: modelsConfig.strong,
			};

		case 'bg3':
			return {
				displayName: 'BG3',
				color: 'magenta',
				placeholder: 'Ask about Baldur\'s Gate 3...',
				welcomeMessage: 'Resumed BG3 session.',
				buildSystemPrompt: () => 'You are a Baldur\'s Gate 3 assistant.',
				tools: [],
				subAgents: [],
				model: modelsConfig.light,
			};

		default:
			// Generic fallback for unknown agents
			return {
				displayName: agentName,
				color: 'white',
				placeholder: 'Continue your conversation...',
				welcomeMessage: `Resumed ${agentName} session.`,
				buildSystemPrompt: () => 'You are a helpful assistant.',
				tools: [],
				subAgents: [],
				model: modelsConfig.light,
			};
	}
}

// ============================================================================
// Session List Component
// ============================================================================

interface SessionListProps {
	sessions: SessionInfo[];
	selectedIndex: number;
	onSelect: (session: SessionInfo) => void;
	onDelete: (session: SessionInfo) => void;
}

function SessionList({ sessions, selectedIndex, onSelect, onDelete }: SessionListProps) {
	const { exit } = useApp();

	useInput((input, key) => {
		if (key.return && sessions[selectedIndex]) {
			onSelect(sessions[selectedIndex]!);
		}

		// 'd' to delete selected session
		if (input === 'd' && sessions[selectedIndex]) {
			onDelete(sessions[selectedIndex]!);
		}

		// 'q' or Escape to quit
		if (input === 'q' || key.escape) {
			exit();
		}
	});

	if (sessions.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow">No saved sessions found.</Text>
				<Text color="gray" dimColor>
					Sessions are auto-saved when you exit an agent.
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{sessions.map((session, index) => {
				const isSelected = index === selectedIndex;
				const agentColor = getAgentColor(session.agentName);

				return (
					<Box key={session.id} flexDirection="row">
						<Text color={isSelected ? 'cyan' : 'gray'}>
							{isSelected ? '▸ ' : '  '}
						</Text>
						<Box width={10}>
							<Text color={agentColor} bold={isSelected}>
								{session.agentName}
							</Text>
						</Box>
						<Box width={16}>
							<Text color="gray" dimColor={!isSelected}>
								{formatRelativeTime(session.updatedAt)}
							</Text>
						</Box>
						<Box width={6}>
							<Text color="gray" dimColor>
								{session.messageCount}msg
							</Text>
						</Box>
						<Box flexShrink={1}>
							<Text color={isSelected ? 'white' : 'gray'} wrap="truncate-end">
								{session.preview}
							</Text>
						</Box>
					</Box>
				);
			})}
		</Box>
	);
}

function getAgentColor(agentName: string): string {
	const colors: Record<string, string> = {
		ask: 'cyan',
		news: 'yellow',
		finance: 'green',
		bg3: 'magenta',
	};
	return colors[agentName] || 'white';
}

// ============================================================================
// Resumed Agent Component
// ============================================================================

interface ResumedAgentProps {
	sessionId: string;
}

function ResumedAgent({ sessionId }: ResumedAgentProps) {
	const modelsConfig = getModelsConfig();
	const [error, setError] = useState<string | null>(null);

	// Load session and create agent
	const { agent, setup } = useMemo(() => {
		const session = loadSession(sessionId);
		if (!session) {
			setError(`Session not found: ${sessionId}`);
			return { agent: null, setup: null };
		}

		const agentSetup = getAgentSetup(session.agentName, modelsConfig);
		if (!agentSetup) {
			setError(`Unknown agent type: ${session.agentName}`);
			return { agent: null, setup: null };
		}

		// Create sub-agents
		const subAgentInstances = agentSetup.subAgents.map(factory => factory());
		const allTools = [...agentSetup.tools, ...subAgentInstances];

		// Create the agent
		const newAgent = createAgent({
			name: session.agentName,
			systemPrompt: agentSetup.buildSystemPrompt(),
			model: agentSetup.model,
			tools: createToolsRecord(allTools),
		});

		// Import the saved session
		newAgent.importSession(session);

		return { agent: newAgent, setup: agentSetup };
	}, [sessionId, modelsConfig]);

	if (error) {
		return (
			<Box padding={1}>
				<Text color="red">Error: {error}</Text>
			</Box>
		);
	}

	if (!agent || !setup) {
		return (
			<Box padding={1}>
				<Text color="yellow">Loading session...</Text>
			</Box>
		);
	}

	return (
		<AgentShell
			agent={agent}
			name={`${setup.displayName} (resumed)`}
			color={setup.color}
			placeholder={setup.placeholder}
			welcomeMessage={setup.welcomeMessage}
		/>
	);
}

// ============================================================================
// Main Resume Command
// ============================================================================

type ViewState =
	| { type: 'list' }
	| { type: 'resumed'; sessionId: string }
	| { type: 'confirm-delete'; session: SessionInfo };

export default function Resume({ options }: { options: ResumeOptions }) {
	const [viewState, setViewState] = useState<ViewState>({ type: 'list' });
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [sessions, setSessions] = useState<SessionInfo[]>([]);

	// Load sessions on mount
	useEffect(() => {
		const loaded = listSessions(options.agent);
		setSessions(loaded);
	}, [options.agent]);

	// Handle navigation
	useInput((_input, key) => {
		if (viewState.type !== 'list') return;

		if (key.upArrow) {
			setSelectedIndex(prev => Math.max(0, prev - 1));
		}
		if (key.downArrow) {
			setSelectedIndex(prev => Math.min(sessions.length - 1, prev + 1));
		}
	});

	const handleSelect = useCallback((session: SessionInfo) => {
		setViewState({ type: 'resumed', sessionId: session.id });
	}, []);

	const handleDelete = useCallback((session: SessionInfo) => {
		setViewState({ type: 'confirm-delete', session });
	}, []);

	const confirmDelete = useCallback(() => {
		if (viewState.type !== 'confirm-delete') return;

		deleteSession(viewState.session.id);
		setSessions(prev => prev.filter(s => s.id !== viewState.session.id));
		setSelectedIndex(prev => Math.min(prev, sessions.length - 2));
		setViewState({ type: 'list' });
	}, [viewState, sessions.length]);

	const cancelDelete = useCallback(() => {
		setViewState({ type: 'list' });
	}, []);

	// Render resumed agent
	if (viewState.type === 'resumed') {
		return <ResumedAgent sessionId={viewState.sessionId} />;
	}

	// Render delete confirmation
	if (viewState.type === 'confirm-delete') {
		return (
			<DeleteConfirmation
				session={viewState.session}
				onConfirm={confirmDelete}
				onCancel={cancelDelete}
			/>
		);
	}

	// Render session list
	const agentNames = getAgentNames();

	return (
		<Box flexDirection="column" padding={1}>
			{/* Header */}
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					Resume Session
				</Text>
				{options.agent && (
					<Text color="gray"> (filtered: {options.agent})</Text>
				)}
			</Box>

			{/* Filter info */}
			{!options.agent && agentNames.length > 1 && (
				<Box marginBottom={1}>
					<Text color="gray" dimColor>
						Agents: {agentNames.join(', ')}
					</Text>
				</Box>
			)}

			{/* Session list */}
			<SessionList
				sessions={sessions}
				selectedIndex={selectedIndex}
				onSelect={handleSelect}
				onDelete={handleDelete}
			/>

			{/* Help footer */}
			<Box marginTop={1}>
				<Text color="gray" dimColor>
					↑↓ navigate | Enter: resume | d: delete | q: quit
				</Text>
			</Box>
		</Box>
	);
}

// ============================================================================
// Delete Confirmation Component
// ============================================================================

interface DeleteConfirmationProps {
	session: SessionInfo;
	onConfirm: () => void;
	onCancel: () => void;
}

function DeleteConfirmation({ session, onConfirm, onCancel }: DeleteConfirmationProps) {
	useInput((input, key) => {
		if (input === 'y' || input === 'Y') {
			onConfirm();
		}
		if (input === 'n' || input === 'N' || key.escape) {
			onCancel();
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Text color="yellow" bold>
				Delete session?
			</Text>
			<Box marginTop={1} marginBottom={1}>
				<Text color="gray">
					Agent: <Text color="cyan">{session.agentName}</Text>
				</Text>
			</Box>
			<Box marginBottom={1}>
				<Text color="gray">
					Preview: {session.preview}
				</Text>
			</Box>
			<Text color="gray">
				Press <Text color="green" bold>y</Text> to confirm, <Text color="red" bold>n</Text> to cancel
			</Text>
		</Box>
	);
}

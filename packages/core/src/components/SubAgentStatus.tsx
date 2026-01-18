import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import { formatDuration, truncate } from '../utils/format.js';
import { parseModelDisplay } from '../utils/model.js';
import {
	agentEvents,
	type AgentBusEvent,
	type SubAgentStartEvent,
	type SubAgentToolCallEvent,
	type SubAgentFinishEvent,
} from '../core/events.js';

// ============================================================================
// Types
// ============================================================================

interface SubAgentToolState {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	status: 'running' | 'complete' | 'error';
	result?: unknown;
	error?: string;
	startTime: number;
	endTime?: number;
}

interface SubAgentState {
	processId: string;
	agentName: string;
	task: string;
	model: string;
	status: 'running' | 'success' | 'error';
	startTime: number;
	endTime?: number;
	toolCalls: Map<string, SubAgentToolState>;
	result?: string;
	error?: string;
}

// ============================================================================
// Props
// ============================================================================

export interface SubAgentStatusProps {
	/** Filter to show only this process (optional - shows all if not set) */
	processId?: string;

	/** Filter to show only sub-agents with this name */
	agentName?: string;

	/** Show completed tool calls (default: true) */
	showCompletedTools?: boolean;

	/** Maximum tool calls to show per sub-agent (default: 10) */
	maxToolCalls?: number;

	/** Compact mode - single line per sub-agent */
	compact?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extracts a meaningful summary from tool results
 */
function extractToolMetadata(_toolName: string, result: unknown): string | null {
	if (!result || typeof result !== 'object') return null;

	const r = result as Record<string, unknown>;

	// Handle errors
	if ('success' in r && r['success'] === false && 'error' in r) {
		return `error: ${truncate(String(r['error']), 30)}`;
	}

	// Common result patterns
	if ('resultCount' in r && typeof r['resultCount'] === 'number') {
		return `${r['resultCount']} results`;
	}
	if ('contentCount' in r && typeof r['contentCount'] === 'number') {
		return `${r['contentCount']} items`;
	}
	if ('lineCount' in r && typeof r['lineCount'] === 'number') {
		return `${r['lineCount']} lines`;
	}
	if ('count' in r && typeof r['count'] === 'number') {
		return `${r['count']} items`;
	}
	if ('holdingsCount' in r && typeof r['holdingsCount'] === 'number') {
		return `${r['holdingsCount']} holdings`;
	}

	if ('success' in r && r['success'] === true) {
		return 'done';
	}

	return null;
}

/**
 * Gets the primary input value to display
 */
function getPrimaryInput(args: Record<string, unknown>): string | null {
	// Common primary params
	const primaryKeys = ['query', 'path', 'url', 'task', 'topic', 'search'];

	for (const key of primaryKeys) {
		const value = args[key];
		if (typeof value === 'string' && value.length > 0) {
			return truncate(value, 40);
		}
	}

	// Fall back to first string value
	for (const value of Object.values(args)) {
		if (typeof value === 'string' && value.length > 0) {
			return truncate(value, 40);
		}
	}

	return null;
}

// ============================================================================
// Sub-Components
// ============================================================================

interface SubAgentToolItemProps {
	tool: SubAgentToolState;
	isLast: boolean;
	isNested?: boolean;
}

function SubAgentToolItem({ tool, isLast, isNested = false }: SubAgentToolItemProps) {
	const connector = isLast ? '└─ ' : '├─ ';
	const indent = isNested ? '   ' : '';

	const StatusIcon = () => {
		switch (tool.status) {
			case 'running':
				return <InkSpinner />;
			case 'complete':
				return <Text color="green">✓</Text>;
			case 'error':
				return <Text color="red">✗</Text>;
		}
	};

	const primaryInput = getPrimaryInput(tool.args);
	const metadata =
		tool.status === 'complete' ? extractToolMetadata(tool.toolName, tool.result) : null;
	const duration = tool.endTime ? tool.endTime - tool.startTime : undefined;

	return (
		<Box>
			<Text color="gray">
				{indent}
				{connector}
			</Text>
			<StatusIcon />
			<Text> </Text>
			<Text color={tool.status === 'running' ? 'cyan' : tool.status === 'error' ? 'red' : 'white'}>
				{tool.toolName}
			</Text>

			{primaryInput && (
				<Text color="gray" dimColor>
					{' '}
					"{primaryInput}"
				</Text>
			)}

			{tool.status === 'complete' && (
				<>
					{duration !== undefined && (
						<Text color="gray" dimColor>
							{' '}
							({formatDuration(duration)})
						</Text>
					)}
					{metadata && (
						<>
							<Text color="gray"> → </Text>
							<Text color="green">{metadata}</Text>
						</>
					)}
				</>
			)}

			{tool.status === 'error' && tool.error && (
				<>
					<Text color="gray"> → </Text>
					<Text color="red">{truncate(tool.error, 40)}</Text>
				</>
			)}
		</Box>
	);
}

interface SubAgentItemProps {
	agent: SubAgentState;
	isLast: boolean;
	showCompletedTools: boolean;
	maxToolCalls: number;
	compact: boolean;
}

function SubAgentItem({
	agent,
	isLast,
	showCompletedTools,
	maxToolCalls,
	compact,
}: SubAgentItemProps) {
	const connector = isLast ? '└─ ' : '├─ ';

	// Filter and limit tool calls
	const allTools = Array.from(agent.toolCalls.values());
	const displayTools = showCompletedTools
		? allTools.slice(-maxToolCalls)
		: allTools.filter((t) => t.status === 'running').slice(-maxToolCalls);

	const duration = agent.endTime ? agent.endTime - agent.startTime : undefined;

	// Status text and color
	let statusText: string;
	let statusColor: string;

	switch (agent.status) {
		case 'running':
			statusText = 'Active';
			statusColor = 'cyan';
			break;
		case 'success':
			statusText = duration ? `Complete - ${formatDuration(duration)}` : 'Complete';
			statusColor = 'green';
			break;
		case 'error':
			statusText = 'Failed';
			statusColor = 'red';
			break;
	}

	// Format agent name for display (convert snake_case to Title Case)
	const displayName = agent.agentName
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

	// Format model name for display
	const modelDisplay = parseModelDisplay(agent.model).shortName;

	if (compact) {
		return (
			<Box>
				<Text color="gray">{connector}</Text>
				<Text>🤖 </Text>
				<Text color={statusColor} bold>
					{displayName}
				</Text>
				<Text color="magenta" dimColor> [{modelDisplay}]</Text>
				<Text color="gray"> ({statusText})</Text>
				{agent.status === 'running' && displayTools.length > 0 && (
					<Text color="gray" dimColor>
						{' '}
						- {displayTools[displayTools.length - 1]?.toolName}...
					</Text>
				)}
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			{/* Agent header */}
			<Box>
				<Text color="gray">{connector}</Text>
				<Text>🤖 </Text>
				<Text color={statusColor} bold>
					{displayName}
				</Text>
				<Text color="magenta" dimColor> [{modelDisplay}]</Text>
				<Text color="gray"> ({statusText})</Text>
			</Box>

			{/* Tool calls */}
			{displayTools.length > 0 && (
				<Box flexDirection="column">
					{displayTools.map((tool, index) => (
						<SubAgentToolItem
							key={tool.toolCallId}
							tool={tool}
							isLast={index === displayTools.length - 1}
							isNested={true}
						/>
					))}
				</Box>
			)}

			{/* Show truncation indicator */}
			{allTools.length > maxToolCalls && (
				<Box>
					<Text color="gray" dimColor>
						{'   '}... {allTools.length - maxToolCalls} more tool calls
					</Text>
				</Box>
			)}
		</Box>
	);
}

// ============================================================================
// Main Component
// ============================================================================

export function SubAgentStatus({
	processId,
	agentName,
	showCompletedTools = true,
	maxToolCalls = 10,
	compact = false,
}: SubAgentStatusProps) {
	const [subAgents, setSubAgents] = useState<Map<string, SubAgentState>>(new Map());

	useEffect(() => {
		const handleStart = (e: AgentBusEvent) => {
			if (e.type !== 'subAgentStart') return;
			const event = e as SubAgentStartEvent;

			// Apply filters
			if (processId && event.processId !== processId) return;
			if (agentName && event.agentName !== agentName) return;

			setSubAgents((prev) => {
				const next = new Map(prev);
				next.set(event.processId, {
					processId: event.processId,
					agentName: event.agentName,
					task: event.task,
					model: event.model,
					status: 'running',
					startTime: event.timestamp,
					toolCalls: new Map(),
				});
				return next;
			});
		};

		const handleToolCall = (e: AgentBusEvent) => {
			if (e.type !== 'subAgentToolCall') return;
			const event = e as SubAgentToolCallEvent;

			// Apply filters
			if (processId && event.processId !== processId) return;

			setSubAgents((prev) => {
				const agent = prev.get(event.processId);
				if (!agent) return prev;

				// Apply agent name filter if set
				if (agentName && agent.agentName !== agentName) return prev;

				const next = new Map(prev);
				const updatedAgent = { ...agent, toolCalls: new Map(agent.toolCalls) };

				updatedAgent.toolCalls.set(event.toolCallId, {
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					args: event.args,
					status: event.status,
					result: event.result,
					error: event.error,
					startTime: event.startTime,
					endTime: event.endTime,
				});

				next.set(event.processId, updatedAgent);
				return next;
			});
		};

		const handleFinish = (e: AgentBusEvent) => {
			if (e.type !== 'subAgentFinish') return;
			const event = e as SubAgentFinishEvent;

			// Apply filters
			if (processId && event.processId !== processId) return;

			setSubAgents((prev) => {
				const agent = prev.get(event.processId);
				if (!agent) return prev;

				// Apply agent name filter if set
				if (agentName && agent.agentName !== agentName) return prev;

				const next = new Map(prev);
				next.set(event.processId, {
					...agent,
					status: event.status,
					endTime: event.timestamp,
					result: event.result,
					error: event.error,
				});
				return next;
			});
		};

		agentEvents.on('subAgentStart', handleStart);
		agentEvents.on('subAgentToolCall', handleToolCall);
		agentEvents.on('subAgentFinish', handleFinish);

		return () => {
			agentEvents.off('subAgentStart', handleStart);
			agentEvents.off('subAgentToolCall', handleToolCall);
			agentEvents.off('subAgentFinish', handleFinish);
		};
	}, [processId, agentName]);

	// Don't render if no sub-agents
	if (subAgents.size === 0) return null;

	const agents = Array.from(subAgents.values());

	return (
		<Box flexDirection="column" marginY={1}>
			<Box marginBottom={0}>
				<Text color="gray" dimColor>
					⚙ Sub-Agents
				</Text>
			</Box>
			{agents.map((agent, index) => (
				<SubAgentItem
					key={agent.processId}
					agent={agent}
					isLast={index === agents.length - 1}
					showCompletedTools={showCompletedTools}
					maxToolCalls={maxToolCalls}
					compact={compact}
				/>
			))}
		</Box>
	);
}

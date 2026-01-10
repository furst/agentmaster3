import React from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import { formatDuration, truncate } from '../utils/format.js';

export interface ToolCallProps {
	/** Tool name */
	name: string;
	/** Current status */
	status: 'pending' | 'running' | 'complete' | 'error' | 'denied';
	/** Tool input arguments */
	input?: Record<string, unknown>;
	/** Tool output/result */
	output?: unknown;
	/** Error message if status is error */
	error?: string;
	/** Duration in milliseconds */
	duration?: number;
}

/**
 * Extracts meaningful metadata from tool results for display
 */
function extractResultMetadata(toolName: string, result: unknown): string | null {
	if (!result || typeof result !== 'object') return null;

	const r = result as Record<string, unknown>;

	// Handle common patterns
	if ('success' in r && r['success'] === false && 'error' in r) {
		return `error: ${truncate(String(r['error']), 40)}`;
	}

	// Tool-specific metadata
	switch (toolName) {
		case 'search_vault':
			if ('resultCount' in r) {
				return `${r['resultCount']} notes found`;
			}
			break;
		case 'read_vault_note':
			if ('lineCount' in r) {
				return `${r['lineCount']} lines`;
			}
			break;
		case 'write_vault_note':
			if ('action' in r) {
				const tags = r['tags'] as string[] | undefined;
				const tagStr = tags?.length ? ` [${tags.join(', ')}]` : '';
				return `${r['action']}${tagStr}`;
			}
			break;
		case 'list_vault_notes':
			if ('count' in r && 'totalCount' in r) {
				return `${r['count']}/${r['totalCount']} notes`;
			}
			break;
		case 'exa_search':
			if ('resultCount' in r) {
				return `${r['resultCount']} results`;
			}
			break;
		case 'exa_get_contents':
			if ('contentCount' in r) {
				return `${r['contentCount']} pages fetched`;
			}
			break;
	}

	// Generic patterns
	if ('resultCount' in r && typeof r['resultCount'] === 'number') {
		return `${r['resultCount']} results`;
	}

	if ('contentCount' in r && typeof r['contentCount'] === 'number') {
		return `${r['contentCount']} items`;
	}

	if ('lineCount' in r && typeof r['lineCount'] === 'number') {
		return `${r['lineCount']} lines`;
	}

	if ('content' in r && typeof r['content'] === 'string') {
		return `${(r['content'] as string).split('\n').length} lines`;
	}

	if ('results' in r && Array.isArray(r['results'])) {
		return `${(r['results'] as unknown[]).length} items`;
	}

	if ('success' in r && r['success'] === true) {
		return 'done';
	}

	return null;
}

/**
 * Gets the primary input parameter to display for a tool
 */
function getPrimaryInput(toolName: string, input: Record<string, unknown>): string | null {
	// Define which param to show for each tool
	const primaryParams: Record<string, string[]> = {
		'search_vault': ['query'],
		'read_vault_note': ['path'],
		'write_vault_note': ['path'],
		'list_vault_notes': ['subfolder'],
		'exa_search': ['query'],
		'exa_get_contents': ['urls'],
		'fetch_page': ['url'],
		'read_file': ['path'],
		'read_pdf': ['path'],
		'list_pdfs': ['directory'],
	};

	const params = primaryParams[toolName] || Object.keys(input).slice(0, 1);

	for (const param of params) {
		const value = input[param];
		if (value !== undefined && value !== null) {
			if (typeof value === 'string') {
				return truncate(value, 50);
			} else if (Array.isArray(value)) {
				if (value.length === 1 && typeof value[0] === 'string') {
					return truncate(value[0], 50);
				}
				return `${value.length} items`;
			}
		}
	}
	return null;
}

/**
 * Formats input arguments for compact display
 */
function formatInputCompact(input: Record<string, unknown>): string {
	const parts: string[] = [];

	for (const [key, value] of Object.entries(input)) {
		if (value === undefined || value === null) continue;

		let displayValue: string;
		if (typeof value === 'string') {
			displayValue = truncate(value, 30);
		} else if (Array.isArray(value)) {
			displayValue = `[${value.length} items]`;
		} else if (typeof value === 'object') {
			displayValue = '{...}';
		} else {
			displayValue = String(value);
		}

		parts.push(`${key}="${displayValue}"`);
	}

	return truncate(parts.join(' '), 60);
}

/**
 * Renders a single tool call in compact Claude Code-inspired format
 */
export function ToolCall({
	name,
	status,
	input,
	output,
	error,
	duration,
}: ToolCallProps) {
	// Status indicator
	const StatusIndicator = () => {
		switch (status) {
			case 'pending':
				return <Text color="gray">○</Text>;
			case 'running':
				return <InkSpinner />;
			case 'complete':
				return <Text color="green">✓</Text>;
			case 'error':
				return <Text color="red">✗</Text>;
			case 'denied':
				return <Text color="yellow">⊘</Text>;
		}
	};

	// Get result metadata
	const metadata = status === 'complete' ? extractResultMetadata(name, output) : null;
	const errorMessage = (status === 'error' || status === 'denied') && error ? truncate(error, 40) : null;

	// Format duration
	const durationStr = duration ? formatDuration(duration) : null;

	// Get primary input to show
	const primaryInput = input ? getPrimaryInput(name, input) : null;

	return (
		<Box>
			<StatusIndicator />
			<Text> </Text>
			<Text color={status === 'running' ? 'cyan' : status === 'error' ? 'red' : status === 'denied' ? 'yellow' : 'white'} bold>
				{name}
			</Text>

			{/* Show primary input param */}
			{primaryInput && (
				<Text color="gray" dimColor>
					{' '}"{primaryInput}"
				</Text>
			)}

			{/* Show full input args when running (if no primary or for extra context) */}
			{(status === 'running' || status === 'pending') && input && Object.keys(input).length > 1 && !primaryInput && (
				<Text color="gray" dimColor>
					{' '}
					{formatInputCompact(input)}
				</Text>
			)}

			{/* Show duration and metadata when complete */}
			{status === 'complete' && (
				<>
					{durationStr && (
						<Text color="gray" dimColor>
							{' '}
							({durationStr})
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

			{/* Show error when failed */}
			{status === 'error' && errorMessage && (
				<>
					<Text color="gray"> → </Text>
					<Text color="red">{errorMessage}</Text>
				</>
			)}
		</Box>
	);
}

export interface ToolCallListProps {
	/** Array of tool calls to display */
	toolCalls: Array<{
		id: string;
		toolCallId: string;
		name: string;
		status: 'pending' | 'running' | 'complete' | 'error' | 'denied';
		args?: unknown;
		result?: unknown;
		error?: string;
		startTime: number;
		endTime?: number;
	}>;
	/** Show all tool calls or just active ones */
	showCompleted?: boolean;
}

/**
 * Renders a list of tool calls in a compact timeline format
 */
export function ToolCallList({ toolCalls, showCompleted = true }: ToolCallListProps) {
	if (toolCalls.length === 0) return null;

	const displayCalls = showCompleted
		? toolCalls
		: toolCalls.filter((tc) => tc.status === 'running' || tc.status === 'pending');

	if (displayCalls.length === 0) return null;

	return (
		<Box flexDirection="column">
			{displayCalls.map((tc, index) => (
				<Box key={tc.id}>
					{/* Tree connector */}
					<Text color="gray">{index === displayCalls.length - 1 ? '└─ ' : '├─ '}</Text>
					<ToolCall
						name={tc.name}
						status={tc.status}
						input={tc.args as Record<string, unknown>}
						output={tc.result}
						error={tc.error}
						duration={tc.endTime ? tc.endTime - tc.startTime : undefined}
					/>
				</Box>
			))}
		</Box>
	);
}

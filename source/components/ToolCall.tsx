import React from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import { formatDuration, truncate } from '../utils/format.js';

export interface ToolCallProps {
	/** Tool name */
	name: string;
	/** Current status */
	status: 'pending' | 'running' | 'complete' | 'error';
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
function extractResultMetadata(_toolName: string, result: unknown): string | null {
	if (!result || typeof result !== 'object') return null;

	const r = result as Record<string, unknown>;

	// Handle common patterns
	if ('success' in r && r['success'] === false && 'error' in r) {
		return `error: ${truncate(String(r['error']), 40)}`;
	}

	// Exa search results
	if ('resultCount' in r && typeof r['resultCount'] === 'number') {
		return `${r['resultCount']} results found`;
	}

	// Exa contents
	if ('contentCount' in r && typeof r['contentCount'] === 'number') {
		return `${r['contentCount']} articles fetched`;
	}

	// File read results
	if ('lines' in r && typeof r['lines'] === 'number') {
		return `${r['lines']} lines`;
	}
	if ('content' in r && typeof r['content'] === 'string') {
		return `${(r['content'] as string).split('\n').length} lines`;
	}

	// Search results with array
	if ('results' in r && Array.isArray(r['results'])) {
		return `${(r['results'] as unknown[]).length} items`;
	}

	// Generic success
	if ('success' in r && r['success'] === true) {
		return 'done';
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
		}
	};

	// Get result metadata
	const metadata = status === 'complete' ? extractResultMetadata(name, output) : null;
	const errorMessage = status === 'error' && error ? truncate(error, 40) : null;

	// Format duration
	const durationStr = duration ? formatDuration(duration) : null;

	return (
		<Box>
			<StatusIndicator />
			<Text> </Text>
			<Text color={status === 'running' ? 'cyan' : status === 'error' ? 'red' : 'white'} bold>
				{name}
			</Text>

			{/* Show input args when running or pending */}
			{(status === 'running' || status === 'pending') && input && Object.keys(input).length > 0 && (
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
		status: 'pending' | 'running' | 'complete' | 'error';
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

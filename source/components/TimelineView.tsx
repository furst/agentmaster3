import React, { memo } from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import { type TimelineEntry } from '../core/timeline.js';
import { ToolCall } from './ToolCall.js';
import { ContentCard } from './ContentCard.js';
import { parseContentWithCards, hasCardMarkers } from '../utils/content-parser.js';
import { truncate, formatDuration } from '../utils/format.js';
import { parseModelDisplay } from '../utils/model.js';

// ============================================================================
// Timeline Entry Components (memoized to prevent unnecessary re-renders)
// ============================================================================

interface UserMessageEntryProps {
	entry: TimelineEntry;
}

/**
 * Renders a user message in the timeline
 */
const UserMessageEntry = memo(function UserMessageEntry({ entry }: UserMessageEntryProps) {
	return (
		<Box marginTop={1}>
			<Text color="green" bold>{'> '}</Text>
			<Text color="green" wrap="wrap">{entry.content}</Text>
		</Box>
	);
});

interface TextSegmentEntryProps {
	entry: TimelineEntry;
}

/**
 * Renders an assistant text segment, with ContentCard support
 */
const TextSegmentEntry = memo(function TextSegmentEntry({ entry }: TextSegmentEntryProps) {
	const content = entry.content ?? '';
	const isStreaming = entry.isStreaming;

	// Check for ContentCard markers (only on finalized content)
	if (!isStreaming && hasCardMarkers(content)) {
		const segments = parseContentWithCards(content);

		return (
			<Box flexDirection="column" marginTop={1}>
				<Box>
					<Text color="blue">{'● '}</Text>
				</Box>
				{segments.map((segment, index) => {
					if (segment.type === 'card' && segment.cardType) {
						return (
							<Box key={`card-${index}`} marginLeft={2}>
								<ContentCard
									type={segment.cardType}
									title={segment.title}
									content={segment.content}
								/>
							</Box>
						);
					}
					// Regular text
					return (
						<Box key={`text-${index}`} marginLeft={2}>
							<Text wrap="wrap">{segment.content}</Text>
						</Box>
					);
				})}
			</Box>
		);
	}

	// Regular text segment - inline with bullet
	return (
		<Box marginTop={1}>
			{isStreaming ? (
				<Text color="cyan">{'● '}</Text>
			) : (
				<Text color="blue">{'● '}</Text>
			)}
			<Text wrap="wrap">
				{content}
				{isStreaming && <Text color="gray">{'▌'}</Text>}
			</Text>
		</Box>
	);
}, (prevProps, nextProps) => {
	// Custom comparison - only re-render if content or streaming status changed
	return prevProps.entry.content === nextProps.entry.content &&
		   prevProps.entry.isStreaming === nextProps.entry.isStreaming;
});

interface ToolCallEntryProps {
	entry: TimelineEntry;
	/** Force status to complete (used when loading is done but status wasn't updated) */
	forceComplete?: boolean;
}

/**
 * Renders a tool call entry with its result
 */
const ToolCallEntry = memo(function ToolCallEntry({ entry, forceComplete = false }: ToolCallEntryProps) {
	const tc = entry.toolCall;
	if (!tc) return null;

	// If forceComplete is true and status is 'running', treat as 'complete'
	const effectiveStatus = (forceComplete && tc.status === 'running') ? 'complete' : tc.status;
	const duration = tc.endTime ? tc.endTime - tc.startTime : undefined;

	const showResult = effectiveStatus === 'complete' && tc.result !== undefined;
	const showError = (effectiveStatus === 'error' || effectiveStatus === 'denied') && tc.error;

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box>
				<Text color="blue">{'● '}</Text>
				<ToolCall
					name={tc.name}
					status={effectiveStatus}
					input={tc.args as Record<string, unknown>}
					output={tc.result}
					error={tc.error}
					duration={duration}
				/>
			</Box>
			{showResult && (
				<Box marginLeft={2}>
					<Text color="gray">{'└  '}</Text>
					<Text color="gray">{formatToolResult(tc.name, tc.result)}</Text>
				</Box>
			)}
			{showError && (
				<Box marginLeft={2}>
					<Text color="gray">{'└  '}</Text>
					<Text color="red">{truncate(tc.error!, 60)}</Text>
				</Box>
			)}
		</Box>
	);
}, (prevProps, nextProps) => {
	// Custom comparison - re-render if tool call status, result, or forceComplete changed
	if (prevProps.forceComplete !== nextProps.forceComplete) return false;
	const prev = prevProps.entry.toolCall;
	const next = nextProps.entry.toolCall;
	if (!prev || !next) return prev === next;
	return prev.status === next.status &&
		   prev.result === next.result &&
		   prev.error === next.error;
});

/**
 * Formats tool result for display in timeline
 */
function formatToolResult(toolName: string, result: unknown): string {
	if (!result || typeof result !== 'object') return 'done';

	const r = result as Record<string, unknown>;

	// Check for error
	if ('success' in r && r['success'] === false && 'error' in r) {
		return truncate(String(r['error']), 50);
	}

	// Tool-specific formatting
	switch (toolName) {
		case 'search_vault':
			if ('resultCount' in r) return `${r['resultCount']} notes found`;
			break;
		case 'read_vault_note':
		case 'read_file':
			if ('lineCount' in r) return `${r['lineCount']} lines`;
			break;
		case 'write_vault_note':
			if ('action' in r) {
				const tags = r['tags'] as string[] | undefined;
				return tags?.length ? `${r['action']} [${tags.join(', ')}]` : String(r['action']);
			}
			break;
		case 'list_vault_notes':
			if ('count' in r && 'totalCount' in r) return `${r['count']}/${r['totalCount']} notes`;
			break;
		case 'exa_search':
			if ('resultCount' in r) return `${r['resultCount']} results`;
			break;
		case 'exa_get_contents':
			if ('contentCount' in r) return `${r['contentCount']} pages`;
			break;
		case 'fetch_page':
			if ('lineCount' in r) return `${r['lineCount']} lines`;
			if ('title' in r) return truncate(String(r['title']), 40);
			break;
		case 'read_pdf':
			if ('pageCount' in r) return `${r['pageCount']} pages`;
			break;
		case 'list_pdfs':
			if ('count' in r) return `${r['count']} PDFs`;
			break;
	}

	// Generic patterns
	if ('resultCount' in r && typeof r['resultCount'] === 'number') {
		return `${r['resultCount']} results`;
	}
	if ('lineCount' in r && typeof r['lineCount'] === 'number') {
		return `${r['lineCount']} lines`;
	}
	if ('count' in r && typeof r['count'] === 'number') {
		return `${r['count']} items`;
	}
	if ('results' in r && Array.isArray(r['results'])) {
		return `${(r['results'] as unknown[]).length} items`;
	}
	if ('success' in r && r['success'] === true) {
		return 'done';
	}

	return 'done';
}

// ============================================================================
// Sub-Agent Entry Component
// ============================================================================

interface SubAgentEntryProps {
	entry: TimelineEntry;
	forceComplete?: boolean;
}

/**
 * Formats sub-agent tool result for display
 */
function formatSubAgentToolResult(_toolName: string, result: unknown): string | null {
	if (!result || typeof result !== 'object') return null;

	const r = result as Record<string, unknown>;

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

	return null;
}

/**
 * Renders a sub-agent entry with its nested tool calls
 */
const SubAgentEntry = memo(function SubAgentEntry({ entry, forceComplete = false }: SubAgentEntryProps) {
	const sa = entry.subAgent;
	if (!sa) return null;

	// Force status to success if forceComplete and still running
	const effectiveStatus = (forceComplete && sa.status === 'running') ? 'success' : sa.status;
	const isRunning = effectiveStatus === 'running';
	const duration = sa.endTime ? sa.endTime - sa.startTime : undefined;

	// Format agent name for display (convert snake_case to Title Case)
	const displayName = sa.agentName
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

	// Format model name
	const modelDisplay = parseModelDisplay(sa.model).shortName;

	// Status indicator
	const StatusIcon = () => {
		if (isRunning) {
			return <InkSpinner />;
		}
		if (effectiveStatus === 'error') {
			return <Text color="red">✗</Text>;
		}
		return <Text color="green">✓</Text>;
	};

	// Status text
	const statusText = isRunning
		? 'Active'
		: effectiveStatus === 'error'
			? 'Failed'
			: duration
				? formatDuration(duration)
				: 'Done';

	const statusColor = isRunning ? 'cyan' : effectiveStatus === 'error' ? 'red' : 'green';

	return (
		<Box flexDirection="column" marginTop={1}>
			{/* Sub-agent header */}
			<Box>
				<StatusIcon />
				<Text> </Text>
				<Text>🤖 </Text>
				<Text color={statusColor} bold>
					{displayName}
				</Text>
				<Text color="magenta" dimColor> [{modelDisplay}]</Text>
				<Text color="gray"> ({statusText})</Text>
			</Box>

			{/* Nested tool calls */}
			{sa.toolCalls.length > 0 && (
				<Box flexDirection="column">
					{sa.toolCalls.map((tc, index) => {
						const isLast = index === sa.toolCalls.length - 1;
						const connector = isLast ? '└─ ' : '├─ ';
						const tcDuration = tc.endTime ? tc.endTime - tc.startTime : undefined;
						const tcResult = formatSubAgentToolResult(tc.toolName, tc.result);

						// Force complete if parent is force-completed
						const tcEffectiveStatus = (forceComplete && tc.status === 'running') ? 'complete' : tc.status;

						const ToolStatusIcon = () => {
							if (tcEffectiveStatus === 'running') {
								return <InkSpinner />;
							}
							if (tcEffectiveStatus === 'error') {
								return <Text color="red">✗</Text>;
							}
							return <Text color="green">✓</Text>;
						};

						// Get primary input to display
						const primaryInput = tc.args['query'] || tc.args['path'] || tc.args['url'] || tc.args['task'];
						const inputDisplay = primaryInput ? truncate(String(primaryInput), 40) : null;

						return (
							<Box key={tc.toolCallId}>
								<Text color="gray">{'   '}{connector}</Text>
								<ToolStatusIcon />
								<Text> </Text>
								<Text color={tcEffectiveStatus === 'running' ? 'cyan' : tcEffectiveStatus === 'error' ? 'red' : 'white'}>
									{tc.toolName}
								</Text>
								{inputDisplay && (
									<Text color="gray" dimColor>
										{' '}"{inputDisplay}"
									</Text>
								)}
								{tcEffectiveStatus === 'complete' && (
									<>
										{tcDuration !== undefined && (
											<Text color="gray" dimColor>
												{' '}({formatDuration(tcDuration)})
											</Text>
										)}
										{tcResult && (
											<>
												<Text color="gray"> → </Text>
												<Text color="green">{tcResult}</Text>
											</>
										)}
									</>
								)}
								{tcEffectiveStatus === 'error' && tc.error && (
									<>
										<Text color="gray"> → </Text>
										<Text color="red">{truncate(tc.error, 40)}</Text>
									</>
								)}
							</Box>
						);
					})}
				</Box>
			)}
		</Box>
	);
}, (prevProps, nextProps) => {
	if (prevProps.forceComplete !== nextProps.forceComplete) return false;
	const prev = prevProps.entry.subAgent;
	const next = nextProps.entry.subAgent;
	if (!prev || !next) return prev === next;
	// Re-render if status changed or tool calls changed
	return prev.status === next.status &&
		   prev.toolCalls.length === next.toolCalls.length &&
		   prev.toolCalls.every((tc, i) => {
			   const nextTc = next.toolCalls[i];
			   return nextTc && tc.status === nextTc.status;
		   });
});

// ============================================================================
// Main TimelineView Component
// ============================================================================

export interface TimelineViewProps {
	/** Timeline entries to display */
	entries: TimelineEntry[];
	/** Currently streaming entry (shown at bottom) */
	streamingEntry: TimelineEntry | null;
	/** Whether the agent is currently loading - used to force-complete tool calls when done */
	isLoading?: boolean;
}

/**
 * Renders a chronological timeline of the conversation
 * with text and tool calls interleaved in order
 */
export const TimelineView = memo(function TimelineView({ entries, streamingEntry, isLoading = true }: TimelineViewProps) {
	if (entries.length === 0 && !streamingEntry) {
		return null;
	}

	return (
		<Box flexDirection="column">
			{entries.map((entry) => (
				<TimelineEntryComponent key={entry.id} entry={entry} forceComplete={!isLoading} />
			))}
			{streamingEntry && (
				<TimelineEntryComponent key={streamingEntry.id} entry={streamingEntry} forceComplete={false} />
			)}
		</Box>
	);
});

interface TimelineEntryComponentProps {
	entry: TimelineEntry;
	/** Force tool calls to show as complete (used when loading is done) */
	forceComplete?: boolean;
}

/**
 * Check if a tool call is a sub-agent (names ending in _agent)
 * Sub-agents are shown in SubAgentStatus, not in the main timeline
 */
function isSubAgentToolCall(entry: TimelineEntry): boolean {
	if (entry.type !== 'tool-call' || !entry.toolCall) return false;
	return entry.toolCall.name.endsWith('_agent');
}

/**
 * Renders a single timeline entry based on its type
 */
const TimelineEntryComponent = memo(function TimelineEntryComponent({ entry, forceComplete = false }: TimelineEntryComponentProps) {
	switch (entry.type) {
		case 'user-message':
			return <UserMessageEntry entry={entry} />;
		case 'text-segment':
		case 'streaming-text':
			return <TextSegmentEntry entry={entry} />;
		case 'tool-call':
			// Skip sub-agent tool calls - they're shown as sub-agent entries
			if (isSubAgentToolCall(entry)) return null;
			return <ToolCallEntry entry={entry} forceComplete={forceComplete} />;
		case 'sub-agent':
			return <SubAgentEntry entry={entry} forceComplete={forceComplete} />;
		default:
			return null;
	}
});

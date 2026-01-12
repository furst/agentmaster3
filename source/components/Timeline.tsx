import React from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import { formatDuration, formatRelativeTime } from '../utils/format.js';

export type TimelineEventType = 'tool_start' | 'tool_end' | 'thinking' | 'response' | 'user_input';

export interface TimelineEvent {
	id: string;
	type: TimelineEventType;
	name?: string;
	timestamp: number;
	status?: 'success' | 'error' | 'running';
	duration?: number;
	detail?: string;
}

export interface TimelineProps {
	/** Events to display */
	events: TimelineEvent[];
	/** Whether to show timestamps */
	showTimestamps?: boolean;
	/** Whether to show relative time */
	relativeTime?: boolean;
	/** Maximum events to show (0 = all) */
	maxEvents?: number;
}

/**
 * Claude Code-inspired timeline component
 * Shows a vertical timeline of events with status indicators
 */
export function Timeline({
	events,
	showTimestamps = false,
	relativeTime = true,
	maxEvents = 0,
}: TimelineProps) {
	const displayEvents = maxEvents > 0 ? events.slice(-maxEvents) : events;
	const hasMore = maxEvents > 0 && events.length > maxEvents;

	if (events.length === 0) {
		return null;
	}

	return (
		<Box flexDirection="column" marginY={1}>
			{hasMore && (
				<Box>
					<Text color="gray" dimColor>
						... {events.length - maxEvents} earlier events
					</Text>
				</Box>
			)}

			{displayEvents.map((event, index) => {
				const isLast = index === displayEvents.length - 1;

				return (
					<TimelineItem
						key={event.id}
						event={event}
						isLast={isLast}
						showTimestamp={showTimestamps}
						relativeTime={relativeTime}
					/>
				);
			})}
		</Box>
	);
}

interface TimelineItemProps {
	event: TimelineEvent;
	isLast: boolean;
	showTimestamp: boolean;
	relativeTime: boolean;
}

function TimelineItem({ event, isLast, showTimestamp, relativeTime }: TimelineItemProps) {
	const { type, name, status, duration, detail, timestamp } = event;

	const getIcon = () => {
		if (status === 'running') {
			return <InkSpinner />;
		}

		switch (type) {
			case 'user_input':
				return <Text color="green">▶</Text>;
			case 'thinking':
				return <Text color="yellow">◐</Text>;
			case 'tool_start':
				return <Text color="cyan">●</Text>;
			case 'tool_end':
				return status === 'error' ? <Text color="red">✗</Text> : <Text color="green">✓</Text>;
			case 'response':
				return <Text color="blue">◆</Text>;
			default:
				return <Text color="gray">○</Text>;
		}
	};

	// Get label for the event
	const getLabel = () => {
		switch (type) {
			case 'user_input':
				return 'Input';
			case 'thinking':
				return 'Thinking';
			case 'tool_start':
				return name ? `${name}` : 'Tool';
			case 'tool_end':
				return name ? `${name}` : 'Tool';
			case 'response':
				return 'Response';
			default:
				return name ?? 'Event';
		}
	};

	// Status suffix
	const getStatusSuffix = () => {
		if (type === 'tool_end' && duration) {
			return ` (${formatDuration(duration)})`;
		}
		if (status === 'error') {
			return ' - failed';
		}
		if (status === 'running') {
			return '...';
		}
		return '';
	};

	// Connector line
	const connector = isLast ? ' ' : '│';
	const connectorColor = 'gray';

	return (
		<Box flexDirection="column">
			<Box>
				{/* Connector */}
				<Text color={connectorColor}>{isLast ? '└' : '├'}</Text>
				<Text color={connectorColor}>─ </Text>

				{/* Icon */}
				{getIcon()}
				<Text> </Text>

				{/* Label */}
				<Text color="white">{getLabel()}</Text>
				<Text color="gray">{getStatusSuffix()}</Text>

				{/* Timestamp */}
				{showTimestamp && (
					<Text color="gray" dimColor>
						{' '}
						{relativeTime ? formatRelativeTime(timestamp) : new Date(timestamp).toLocaleTimeString()}
					</Text>
				)}
			</Box>

			{/* Detail line if present */}
			{detail && (
				<Box>
					<Text color={connectorColor}>{connector}</Text>
					<Text>   </Text>
					<Text color="gray" dimColor>
						{detail}
					</Text>
				</Box>
			)}

			{/* Spacing line for non-last items */}
			{!isLast && (
				<Box>
					<Text color={connectorColor}>{connector}</Text>
				</Box>
			)}
		</Box>
	);
}

/**
 * Compact inline timeline for status bar
 */
export interface InlineTimelineProps {
	/** Current status */
	status: 'idle' | 'thinking' | 'tool' | 'responding';
	/** Current tool name if status is 'tool' */
	toolName?: string;
	/** Number of completed steps */
	completedSteps?: number;
}

export function InlineTimeline({ status, toolName, completedSteps = 0 }: InlineTimelineProps) {
	const getStatusDisplay = () => {
		switch (status) {
			case 'idle':
				return <Text color="gray">Ready</Text>;
			case 'thinking':
				return (
					<Box>
						<InkSpinner />
						<Text color="cyan"> Thinking...</Text>
					</Box>
				);
			case 'tool':
				return (
					<Box>
						<InkSpinner />
						<Text color="yellow"> Running {toolName ?? 'tool'}...</Text>
					</Box>
				);
			case 'responding':
				return (
					<Box>
						<InkSpinner />
						<Text color="green"> Responding...</Text>
					</Box>
				);
		}
	};

	return (
		<Box>
			{getStatusDisplay()}
			{completedSteps > 0 && (
				<Text color="gray" dimColor>
					{' '}
					({completedSteps} steps)
				</Text>
			)}
		</Box>
	);
}

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';
import { agentEvents, type AgentBusEvent, type TodoUpdateEvent } from '../core/events.js';
import { loadTodos, type TodoItem } from '../core/session-todo.js';

// ============================================================================
// Props
// ============================================================================

export interface TodoListProps {
	/** Filter to show only todos for this session */
	sessionId?: string;

	/** Compact mode - single summary line */
	compact?: boolean;

	/** Maximum items to show (0 = all) */
	maxItems?: number;

	/** Show completed items */
	showCompleted?: boolean;

	/** Whether the agent is currently loading (affects spinner display) */
	isAgentLoading?: boolean;
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TodoItemDisplayProps {
	todo: TodoItem;
	isLast: boolean;
	isAgentLoading?: boolean;
}

function TodoItemDisplay({ todo, isLast, isAgentLoading = true }: TodoItemDisplayProps) {
	const connector = isLast ? '└─ ' : '├─ ';

	const StatusIcon = () => {
		switch (todo.status) {
			case 'pending':
				return <Text color="gray">○</Text>;
			case 'in_progress':
				// Only show spinner if agent is actively loading
				// Otherwise show a static indicator (stalled/incomplete)
				if (isAgentLoading) {
					return <InkSpinner />;
				}
				return <Text color="yellow">○</Text>; // Stalled - incomplete
			case 'completed':
				return <Text color="green">✓</Text>;
		}
	};

	const textColor =
		todo.status === 'completed'
			? 'gray'
			: todo.status === 'in_progress'
				? (isAgentLoading ? 'cyan' : 'yellow') // Yellow when stalled
				: 'white';

	return (
		<Box>
			<Text color="gray">{connector}</Text>
			<StatusIcon />
			<Text> </Text>
			<Text
				color={textColor}
				strikethrough={todo.status === 'completed'}
				dimColor={todo.status === 'completed'}
			>
				{todo.content}
			</Text>
		</Box>
	);
}

// ============================================================================
// Main Component
// ============================================================================

export function TodoList({
	sessionId,
	compact = false,
	maxItems = 0,
	showCompleted = true,
	isAgentLoading = false,
}: TodoListProps) {
	const [todos, setTodos] = useState<TodoItem[]>([]);

	// Load initial todos from disk
	useEffect(() => {
		if (!sessionId) return;

		const list = loadTodos(sessionId);
		if (list) {
			setTodos(list.todos);
		}
	}, [sessionId]);

	// Subscribe to todo update events
	useEffect(() => {
		const handleUpdate = (e: AgentBusEvent) => {
			if (e.type !== 'todoUpdate') return;
			const event = e as TodoUpdateEvent;

			// Filter by session if specified
			if (sessionId && event.sessionId !== sessionId) return;

			// Update todos with full TodoItem shape
			setTodos(
				event.todos.map((t) => ({
					id: t.id,
					content: t.content,
					status: t.status,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}))
			);
		};

		agentEvents.on('todoUpdate', handleUpdate);
		return () => {
			agentEvents.off('todoUpdate', handleUpdate);
		};
	}, [sessionId]);

	// Don't render if no todos
	if (todos.length === 0) return null;

	// Filter and limit
	const filteredTodos = showCompleted
		? todos
		: todos.filter((t) => t.status !== 'completed');

	const displayTodos = maxItems > 0 ? filteredTodos.slice(0, maxItems) : filteredTodos;

	// Calculate progress
	const completed = todos.filter((t) => t.status === 'completed').length;
	const inProgress = todos.filter((t) => t.status === 'in_progress').length;
	const total = todos.length;

	// Compact mode - single line summary
	if (compact) {
		return (
			<Box>
				<Text color="gray" dimColor>
					Tasks:{' '}
				</Text>
				<Text color="green">{completed}</Text>
				<Text color="gray">/{total}</Text>
				{inProgress > 0 && (
					<Text color="cyan"> ({inProgress} in progress)</Text>
				)}
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginY={1}>
			{/* Header with progress */}
			<Box marginBottom={0}>
				<Text color="gray" dimColor>
					Tasks ({completed}/{total})
				</Text>
			</Box>

			{/* Todo items */}
			{displayTodos.map((todo, index) => (
				<TodoItemDisplay
					key={todo.id}
					todo={todo}
					isLast={index === displayTodos.length - 1}
					isAgentLoading={isAgentLoading}
				/>
			))}

			{/* Truncation indicator */}
			{maxItems > 0 && filteredTodos.length > maxItems && (
				<Box>
					<Text color="gray" dimColor>
						{'   '}... {filteredTodos.length - maxItems} more
					</Text>
				</Box>
			)}
		</Box>
	);
}

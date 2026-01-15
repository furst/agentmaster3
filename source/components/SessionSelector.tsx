/**
 * Session Selector Component
 *
 * Inline component for selecting and resuming previous sessions.
 * Used when typing /resume within an agent.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import {
	listSessions,
	loadSession,
	deleteSession,
	formatRelativeTime,
	type SessionInfo,
} from '../core/session-manager.js';
import type { AgentSession } from '../core/agent.js';

export interface SessionSelectorProps {
	/** Agent name to filter sessions */
	agentName: string;
	/** Called when a session is selected */
	onSelect: (session: AgentSession) => void;
	/** Called when the selector is cancelled */
	onCancel: () => void;
	/** Accent color */
	color?: string;
}

export function SessionSelector({
	agentName,
	onSelect,
	onCancel,
	color = 'cyan',
}: SessionSelectorProps) {
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [confirmDelete, setConfirmDelete] = useState<SessionInfo | null>(null);

	// Load sessions on mount
	useEffect(() => {
		const loaded = listSessions(agentName);
		setSessions(loaded);
	}, [agentName]);

	// Handle keyboard input
	useInput((input, key) => {
		// Handle delete confirmation
		if (confirmDelete) {
			if (input === 'y' || input === 'Y') {
				deleteSession(confirmDelete.id);
				setSessions(prev => prev.filter(s => s.id !== confirmDelete.id));
				setSelectedIndex(prev => Math.min(prev, sessions.length - 2));
				setConfirmDelete(null);
			} else if (input === 'n' || input === 'N' || key.escape) {
				setConfirmDelete(null);
			}
			return;
		}

		// Navigation
		if (key.upArrow) {
			setSelectedIndex(prev => Math.max(0, prev - 1));
			return;
		}
		if (key.downArrow) {
			setSelectedIndex(prev => Math.min(sessions.length - 1, prev + 1));
			return;
		}

		// Select session
		if (key.return && sessions[selectedIndex]) {
			const session = loadSession(sessions[selectedIndex]!.id);
			if (session) {
				onSelect(session);
			}
			return;
		}

		// Delete session
		if (input === 'd' && sessions[selectedIndex]) {
			setConfirmDelete(sessions[selectedIndex]!);
			return;
		}

		// Cancel
		if (key.escape || input === 'q') {
			onCancel();
			return;
		}
	});

	// Delete confirmation view
	if (confirmDelete) {
		return (
			<Box flexDirection="column" marginY={1}>
				<Text color="yellow" bold>Delete this session?</Text>
				<Box marginTop={1}>
					<Text color="gray">
						{confirmDelete.preview.slice(0, 60)}
						{confirmDelete.preview.length > 60 ? '...' : ''}
					</Text>
				</Box>
				<Box marginTop={1}>
					<Text>
						Press <Text color="green" bold>y</Text> to confirm, <Text color="red" bold>n</Text> to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// No sessions view
	if (sessions.length === 0) {
		return (
			<Box flexDirection="column" marginY={1}>
				<Text color="yellow">No previous sessions found for {agentName}.</Text>
				<Text color="gray" dimColor>Press Escape to cancel.</Text>
			</Box>
		);
	}

	// Session list view
	return (
		<Box flexDirection="column" marginY={1}>
			<Box marginBottom={1}>
				<Text color={color} bold>/resume</Text>
				<Text color="gray"> - Select a previous session</Text>
			</Box>

			{/* Session list */}
			<Box flexDirection="column">
				{sessions.slice(0, 10).map((session, index) => {
					const isSelected = index === selectedIndex;

					return (
						<Box key={session.id} flexDirection="row">
							<Text color={isSelected ? color : 'gray'}>
								{isSelected ? '▸ ' : '  '}
							</Text>
							<Box width={14}>
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

			{/* Show more indicator */}
			{sessions.length > 10 && (
				<Box marginTop={1}>
					<Text color="gray" dimColor>
						...and {sessions.length - 10} more sessions
					</Text>
				</Box>
			)}

			{/* Help footer */}
			<Box marginTop={1}>
				<Text color="gray" dimColor>
					↑↓ navigate | Enter: resume | d: delete | Esc: cancel
				</Text>
			</Box>
		</Box>
	);
}

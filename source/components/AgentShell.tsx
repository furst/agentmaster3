import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { TextInput } from '@inkjs/ui';
import { MessageList } from './Message.js';
import { ToolCallList } from './ToolCall.js';
import { SubAgentStatus } from './SubAgentStatus.js';
import { InlineTimeline } from './Timeline.js';
import { ErrorDisplay, ApiErrorDisplay } from './Error.js';
import { ModelIndicator } from './ModelIndicator.js';
import { useAgent, type Agent } from '../core/agent.js';

export interface AgentShellProps {
	/** The agent instance to use */
	agent: Agent;
	/** Display name for the agent */
	name: string;
	/** Accent color for the UI */
	color?: string;
	/** Placeholder text for the input field */
	placeholder?: string;
	/** Initial prompt to send on mount */
	initialPrompt?: string;
	/** Welcome message to show before first interaction */
	welcomeMessage?: string;
	/** Whether to show the header */
	showHeader?: boolean;
}

/**
 * Main agent shell component - the primary UI wrapper for agents
 * Inspired by Claude Code's interface
 */
export function AgentShell({
	agent,
	name,
	color = 'cyan',
	placeholder = 'Type a message...',
	initialPrompt,
	welcomeMessage,
	showHeader = true,
}: AgentShellProps) {
	const { exit } = useApp();
	const {
		messages,
		isLoading,
		streamingContent,
		currentToolCalls,
		error,
		sendMessage,
		cancel,
		reset,
	} = useAgent(agent);

	const [hasStarted, setHasStarted] = useState(false);
	// Key to force re-mount TextInput after submission (clears the input)
	const [inputKey, setInputKey] = useState(0);

	// Handle initial prompt
	useEffect(() => {
		if (initialPrompt && !hasStarted) {
			setHasStarted(true);
			sendMessage(initialPrompt);
		}
	}, [initialPrompt, hasStarted, sendMessage]);

	// Handle keyboard shortcuts
	useInput((input, key) => {
		// Ctrl+C to cancel current operation or exit
		if (key.ctrl && input === 'c') {
			if (isLoading) {
				cancel();
			} else {
				exit();
			}
			return;
		}

		// Ctrl+R to reset conversation
		if (key.ctrl && input === 'r') {
			reset();
			setInputKey((k) => k + 1); // Reset input field too
			return;
		}
	});

	// Handle input submission
	const handleSubmit = useCallback(
		(value: string) => {
			if (!value.trim() || isLoading) return;
			setHasStarted(true);
			sendMessage(value.trim());
			// Force re-mount to clear input
			setInputKey((k) => k + 1);
		},
		[isLoading, sendMessage]
	);

	// Determine current status for timeline
	const getStatus = (): 'idle' | 'thinking' | 'tool' | 'responding' => {
		if (!isLoading) return 'idle';

		const runningTools = currentToolCalls.filter((tc) => tc.status === 'running');
		if (runningTools.length > 0) return 'tool';

		if (streamingContent) return 'responding';

		return 'thinking';
	};

	const currentStatus = getStatus();
	const runningTool = currentToolCalls.find((tc) => tc.status === 'running');

	return (
		<Box flexDirection="column" padding={1}>
			{/* Header */}
			{showHeader && (
				<Box marginBottom={1}>
					<Text color={color} bold>
						{name}
					</Text>
					<Text color="gray"> | </Text>
					<ModelIndicator model={agent.model} reasoning={agent.reasoning} />
					<Text color="gray"> | </Text>
					<Text color="gray" dimColor>
						Ctrl+C to {isLoading ? 'cancel' : 'exit'}, Ctrl+R to reset
					</Text>
				</Box>
			)}

			{/* Welcome message */}
			{welcomeMessage && !hasStarted && messages.length === 0 && (
				<Box marginBottom={1}>
					<Text color="gray">{welcomeMessage}</Text>
				</Box>
			)}

			{/* Message history */}
			<MessageList messages={messages} streamingContent={streamingContent} />

			{/* Tool calls section */}
			{currentToolCalls.length > 0 && (
				<Box flexDirection="column" marginY={1}>
					<Box marginBottom={0}>
						<Text color="gray" dimColor>
							⚙ Tools
						</Text>
					</Box>
					<ToolCallList toolCalls={currentToolCalls} showCompleted={true} />
				</Box>
			)}

			{/* Sub-agent status section */}
			{isLoading && <SubAgentStatus showCompletedTools={true} maxToolCalls={5} />}

			{/* Error display */}
			{error && (
				<Box marginY={1}>
					{error.message.toLowerCase().includes('api') ||
					error.message.toLowerCase().includes('key') ? (
						<ApiErrorDisplay error={error} />
					) : (
						<ErrorDisplay error={error} />
					)}
				</Box>
			)}

			{/* Status bar */}
			<Box marginTop={1} marginBottom={1}>
				<InlineTimeline
					status={currentStatus}
					toolName={runningTool?.name}
					completedSteps={currentToolCalls.filter((tc) => tc.status === 'complete').length}
				/>
			</Box>

			{/* Input field */}
			<Box>
				<Text color={color} bold>
					{'> '}
				</Text>
				<TextInput
					key={inputKey}
					placeholder={isLoading ? 'Processing...' : placeholder}
					onSubmit={handleSubmit}
					isDisabled={isLoading}
				/>
			</Box>
		</Box>
	);
}

/**
 * Minimal agent shell without status bar and header
 * For embedding in other UIs
 */
export interface MinimalAgentShellProps {
	agent: Agent;
	placeholder?: string;
	initialPrompt?: string;
}

export function MinimalAgentShell({
	agent,
	placeholder = 'Type a message...',
	initialPrompt,
}: MinimalAgentShellProps) {
	return (
		<AgentShell
			agent={agent}
			name=""
			placeholder={placeholder}
			initialPrompt={initialPrompt}
			showHeader={false}
		/>
	);
}

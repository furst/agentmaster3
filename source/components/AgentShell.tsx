import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { PlanReview, PlanModeIndicator } from './PlanReview.js';
import { TimelineView } from './TimelineView.js';
import { InlineTimeline } from './Timeline.js';
import { ErrorDisplay, ApiErrorDisplay } from './Error.js';
import { ModelIndicator } from './ModelIndicator.js';
import { type Agent } from '../core/agent.js';
import { useAgentTimeline } from '../core/timeline.js';
import { usePlanMode, isPlanningMessage } from '../core/plan-mode.js';

// Image file extensions we detect
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/**
 * Detect if a string looks like an image file path
 */
function isImagePath(str: string): boolean {
	const trimmed = str.trim();
	const lower = trimmed.toLowerCase();
	return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext)) &&
		(trimmed.startsWith('/') || trimmed.startsWith('~') || trimmed.includes('/'));
}

/**
 * Extract image paths from input text
 * Returns [remainingText, extractedPaths]
 */
function extractImagePaths(text: string): [string, string[]] {
	const paths: string[] = [];
	let remaining = text;

	// Match file paths (starting with / or ~ or containing /)
	// Common patterns when dropping files into terminal
	const pathPattern = /(?:^|\s)((?:\/|~)[^\s]+\.(?:png|jpg|jpeg|webp|gif))(?:\s|$)/gi;

	let match;
	while ((match = pathPattern.exec(text)) !== null) {
		const path = match[1]!.trim();
		if (isImagePath(path)) {
			paths.push(path);
			remaining = remaining.replace(path, '').trim();
		}
	}

	// Also check if the entire input is just a path
	if (paths.length === 0 && isImagePath(text.trim())) {
		return ['', [text.trim()]];
	}

	// Clean up extra spaces
	remaining = remaining.replace(/\s+/g, ' ').trim();

	return [remaining, paths];
}

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
		timeline,
		streamingEntry,
		messages,
		isLoading,
		currentToolCalls,
		error,
		stats,
		sendMessage,
		addUserMessage,
		cancel,
		reset,
	} = useAgentTimeline(agent);

	const [hasStarted, setHasStarted] = useState(false);
	// Controlled input value
	const [inputValue, setInputValue] = useState('');
	// Attached images (extracted from dropped/pasted paths)
	const [attachedImages, setAttachedImages] = useState<string[]>([]);

	// Plan mode state and handlers from custom hook
	const {
		planModeEnabled,
		currentPlan,
		isPlanProcessing,
		togglePlanMode,
		createPlanFromPrompt,
		handlePlanApprove,
		handlePlanEdit,
		handlePlanCancel,
		resetPlanState,
		loadExistingPlan,
	} = usePlanMode({
		agent,
		sendMessage,
		addUserMessage,
		messages,
	});

	// Track initialization state with ref to prevent race conditions
	const isInitializedRef = useRef(false);

	// Combined initialization effect - handles both plan loading and initial prompt
	useEffect(() => {
		if (isInitializedRef.current) return;
		isInitializedRef.current = true;

		// First, check for existing plan (synchronous)
		const existingPlan = loadExistingPlan();
		if (existingPlan) {
			// Don't send initial prompt when resuming a plan
			return;
		}

		// No existing plan - handle initial prompt if provided
		if (initialPrompt) {
			setHasStarted(true);
			sendMessage(initialPrompt);
		}
	}, [initialPrompt, sendMessage, loadExistingPlan]);

	// Handle keyboard shortcuts
	useInput((input, key) => {
		// Ctrl+C to cancel current operation or exit
		if (key.ctrl && input === 'c') {
			if (isLoading || isPlanProcessing) {
				cancel();
			} else {
				exit();
			}
			return;
		}

		// Ctrl+R to reset conversation
		if (key.ctrl && input === 'r') {
			reset();
			resetPlanState();
			setInputValue('');
			setAttachedImages([]);
			return;
		}

		// Shift+Tab to toggle plan mode
		if (key.shift && key.tab) {
			if (!isLoading && !isPlanProcessing && !currentPlan) {
				togglePlanMode();
			}
			return;
		}
	});

	// Handle input change - detect and extract image paths in real-time
	const handleInputChange = useCallback((value: string) => {
		const [remaining, newPaths] = extractImagePaths(value);

		if (newPaths.length > 0) {
			// Found image paths - add to attachments and keep remaining text
			setAttachedImages(prev => [...prev, ...newPaths]);
			setInputValue(remaining);
		} else {
			setInputValue(value);
		}
	}, []);

	// Handle input submission
	const handleSubmit = useCallback(
		(value: string) => {
			// Use current input value and attached images
			const textToSend = value.trim();
			const allImages = attachedImages;

			if (!textToSend && allImages.length === 0) return;
			if (isLoading || isPlanProcessing) return;

			setHasStarted(true);

			// Format message with image attachments if any
			let finalMessage: string;
			if (allImages.length > 0) {
				const imageRefs = allImages.map((path, i) => `[Image #${i + 1}: ${path}]`).join('\n');
				if (textToSend) {
					finalMessage = `${textToSend}\n\n${imageRefs}`;
				} else {
					// Just images, no text - add default action
					finalMessage = `Parse my portfolio from the attached image.\n\n${imageRefs}`;
				}
			} else {
				finalMessage = textToSend;
			}

			// If plan mode is enabled and no current plan, create one first
			if (planModeEnabled && !currentPlan) {
				createPlanFromPrompt(finalMessage);
			} else {
				sendMessage(finalMessage);
			}

			// Clear input state
			setInputValue('');
			setAttachedImages([]);
		},
		[isLoading, isPlanProcessing, planModeEnabled, currentPlan, sendMessage, createPlanFromPrompt, attachedImages]
	);

	// Determine current status for inline status bar
	const currentStatus = useMemo((): 'idle' | 'thinking' | 'tool' | 'responding' => {
		if (!isLoading) return 'idle';

		const runningTools = currentToolCalls.filter((tc) => tc.status === 'running');
		if (runningTools.length > 0) return 'tool';

		if (streamingEntry) return 'responding';

		return 'thinking';
	}, [isLoading, currentToolCalls, streamingEntry]);

	const runningTool = currentToolCalls.find((tc) => tc.status === 'running');

	// Filter out internal planning messages from timeline display
	const displayTimeline = useMemo(() => {
		return timeline.filter((entry) => {
			// Filter user messages that are internal planning prompts
			if (entry.type === 'user-message' && entry.content && isPlanningMessage(entry.content)) {
				return false;
			}
			// Filter assistant text that contains plan format when showing PlanReview
			if (entry.type === 'text-segment' && entry.content && currentPlan?.status === 'draft') {
				if (entry.content.includes('**Objective:**') && entry.content.includes('**Steps:**')) {
					return false;
				}
			}
			return true;
		});
	}, [timeline, currentPlan]);

	// Filter streaming entry for planning content
	const displayStreamingEntry = useMemo(() => {
		if (!streamingEntry) return null;
		// Don't show streaming if it's a plan response
		if (currentPlan?.status === 'draft' && streamingEntry.content) {
			if (streamingEntry.content.includes('**Objective:**')) {
				return null;
			}
		}
		return streamingEntry;
	}, [streamingEntry, currentPlan]);

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
					<PlanModeIndicator enabled={planModeEnabled} />
					<Text color="gray"> | </Text>
					<Text color="gray" dimColor>
						Shift+Tab: plan mode, Ctrl+C: {isLoading || isPlanProcessing ? 'cancel' : 'exit'}
					</Text>
				</Box>
			)}

			{/* Welcome message */}
			{welcomeMessage && !hasStarted && timeline.length === 0 && (
				<Box marginBottom={1}>
					<Text color="gray">{welcomeMessage}</Text>
				</Box>
			)}

			{/* Timeline view - shows messages, tool calls, and sub-agents interleaved */}
			<TimelineView entries={displayTimeline} streamingEntry={displayStreamingEntry} isLoading={isLoading} currentToolCalls={currentToolCalls} />

			{/* Plan review section */}
			{currentPlan && currentPlan.status === 'draft' && (
				<PlanReview
					plan={currentPlan}
					onApprove={handlePlanApprove}
					onEdit={handlePlanEdit}
					onCancel={handlePlanCancel}
					isProcessing={isPlanProcessing}
				/>
			)}

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
				{/* Cost display when idle and has stats */}
				{!isLoading && stats && stats.totalTokens > 0 && (
					<Box marginLeft={2}>
						<Text color="gray" dimColor>
							| {stats.totalTokens.toLocaleString()} tokens | ${stats.costUSD.toFixed(4)}
						</Text>
					</Box>
				)}
			</Box>

			{/* Attached images indicator */}
			{attachedImages.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					{attachedImages.map((imgPath, index) => (
						<Box key={imgPath}>
							<Text color="magenta">[Image #{index + 1}]</Text>
							<Text color="gray" dimColor> {imgPath.split('/').pop()}</Text>
						</Box>
					))}
				</Box>
			)}

			{/* Input field */}
			{!currentPlan && (
				<Box>
					<Text color={planModeEnabled ? 'cyan' : color} bold>
						{planModeEnabled ? '📋 ' : '> '}
					</Text>
					<TextInput
						value={inputValue}
						onChange={handleInputChange}
						onSubmit={handleSubmit}
						placeholder={
							isLoading || isPlanProcessing
								? 'Processing...'
								: attachedImages.length > 0
									? 'Add a message or press Enter to parse...'
									: planModeEnabled
										? 'Describe your task (will research, then plan)...'
										: placeholder
						}
						focus={!isLoading && !isPlanProcessing}
					/>
				</Box>
			)}
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

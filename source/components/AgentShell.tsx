import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { TextInput } from '@inkjs/ui';
import { PlanReview, PlanModeIndicator } from './PlanReview.js';
import { TimelineView } from './TimelineView.js';
import { InlineTimeline } from './Timeline.js';
import { ErrorDisplay, ApiErrorDisplay } from './Error.js';
import { ModelIndicator } from './ModelIndicator.js';
import { type Agent } from '../core/agent.js';
import { useAgentTimeline } from '../core/timeline.js';
import {
	createPlan,
	approvePlan,
	cancelPlan,
	parsePlanFromText,
	loadPlan,
	clearPlan,
	type Plan,
} from '../core/session-plan.js';

// Planning prompt markers for filtering
const PLAN_PROMPT_MARKERS = [
	'You are in PLANNING MODE',
	'Revise the plan based on this feedback:',
	'The user has approved this plan. Now execute it',
];

/**
 * Check if a message is an internal planning prompt that should be hidden
 */
function isPlanningMessage(content: string): boolean {
	return PLAN_PROMPT_MARKERS.some((marker) => content.startsWith(marker));
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
		cancel,
		reset,
	} = useAgentTimeline(agent);

	const [hasStarted, setHasStarted] = useState(false);
	// Key to force re-mount TextInput after submission (clears the input)
	const [inputKey, setInputKey] = useState(0);

	// Plan mode state
	const [planModeEnabled, setPlanModeEnabled] = useState(false);
	const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
	const [isPlanProcessing, setIsPlanProcessing] = useState(false);
	const pendingPromptRef = useRef<string | null>(null);

	// Load any existing plan on mount
	useEffect(() => {
		const existingPlan = loadPlan(agent.getSessionId());
		if (existingPlan && existingPlan.status === 'draft') {
			setCurrentPlan(existingPlan);
			setPlanModeEnabled(true);
		}
	}, [agent]);

	// Handle initial prompt (skip if plan mode would interfere)
	useEffect(() => {
		if (initialPrompt && !hasStarted && !planModeEnabled) {
			setHasStarted(true);
			sendMessage(initialPrompt);
		}
	}, [initialPrompt, hasStarted, sendMessage, planModeEnabled]);

	// Handle keyboard shortcuts
	useInput((input, key) => {
		// Ctrl+C to cancel current operation or exit
		if (key.ctrl && input === 'c') {
			if (isLoading || isPlanProcessing) {
				cancel();
				setIsPlanProcessing(false);
			} else {
				exit();
			}
			return;
		}

		// Ctrl+R to reset conversation
		if (key.ctrl && input === 'r') {
			reset();
			setCurrentPlan(null);
			clearPlan(agent.getSessionId());
			setInputKey((k) => k + 1);
			return;
		}

		// Shift+Tab to toggle plan mode
		if (key.shift && key.tab) {
			if (!isLoading && !isPlanProcessing && !currentPlan) {
				setPlanModeEnabled((prev) => !prev);
			}
			return;
		}
	});

	// Create a plan from user prompt
	const createPlanFromPrompt = useCallback(
		async (prompt: string) => {
			setIsPlanProcessing(true);
			pendingPromptRef.current = prompt;

			// Ask agent to create a plan
			const planPrompt = `You are in PLANNING MODE. Do NOT execute the task yet. Instead, create a plan.

User request: "${prompt}"

Create a structured plan with:
1. A clear objective (one sentence)
2. Numbered steps to achieve it (be specific)

Format your response EXACTLY like this:
**Objective:** [Your objective here]

**Steps:**
1. [First step]
2. [Second step]
3. [Third step]
...

IMPORTANT: Only output the plan. Do not start executing it.`;

			try {
				await sendMessage(planPrompt);
			} finally {
				setIsPlanProcessing(false);
			}
		},
		[sendMessage]
	);

	// Parse plan from agent response
	useEffect(() => {
		if (!isPlanProcessing && pendingPromptRef.current && messages.length > 0) {
			const lastMessage = messages[messages.length - 1];
			if (lastMessage?.role === 'assistant' && lastMessage.content) {
				const parsed = parsePlanFromText(lastMessage.content);
				if (parsed && parsed.steps.length > 0) {
					const plan = createPlan(
						agent.getSessionId(),
						pendingPromptRef.current,
						parsed.objective,
						parsed.steps
					);
					setCurrentPlan(plan);
					pendingPromptRef.current = null;
				}
			}
		}
	}, [messages, isPlanProcessing, agent]);

	// Handle plan approval
	const handlePlanApprove = useCallback(() => {
		if (!currentPlan) return;

		const result = approvePlan(agent.getSessionId(), agent.name);
		if (result) {
			setCurrentPlan(null);
			// Disable plan mode after approval - continue as normal chat
			setPlanModeEnabled(false);

			// Build step list with todo IDs so agent knows which to update
			const stepsWithIds = result.plan.steps
				.map((s, i) => `${i + 1}. ${s.description} (todo_id: ${result.todoIds[i]})`)
				.join('\n');

			// Execute the original prompt
			const executePrompt = `The user has approved this plan. Now execute it step by step.

Original request: "${result.plan.originalPrompt}"

Plan steps (with todo IDs):
${stepsWithIds}

IMPORTANT: As you complete each step, call update_todo with the corresponding todo_id to mark it as completed. Do NOT create new todos - use the existing ones listed above.`;

			sendMessage(executePrompt);
		}
	}, [currentPlan, agent, sendMessage]);

	// Handle plan edit request
	const handlePlanEdit = useCallback(
		async (feedback: string) => {
			if (!currentPlan) return;

			setIsPlanProcessing(true);

			const editPrompt = `Revise the plan based on this feedback:

Original request: "${currentPlan.originalPrompt}"

Current plan:
${currentPlan.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

User feedback: "${feedback}"

Provide a revised plan in the same format:
**Objective:** [Your objective here]

**Steps:**
1. [First step]
2. [Second step]
...`;

			pendingPromptRef.current = currentPlan.originalPrompt;

			try {
				await sendMessage(editPrompt);
			} finally {
				setIsPlanProcessing(false);
			}
		},
		[currentPlan, sendMessage]
	);

	// Handle plan cancellation
	const handlePlanCancel = useCallback(() => {
		if (currentPlan) {
			cancelPlan(agent.getSessionId());
		}
		setCurrentPlan(null);
		setPlanModeEnabled(false);
		pendingPromptRef.current = null;
	}, [currentPlan, agent]);

	// Handle input submission
	const handleSubmit = useCallback(
		(value: string) => {
			if (!value.trim() || isLoading || isPlanProcessing) return;
			setHasStarted(true);

			// If plan mode is enabled and no current plan, create one first
			if (planModeEnabled && !currentPlan) {
				createPlanFromPrompt(value.trim());
			} else {
				sendMessage(value.trim());
			}

			// Force re-mount to clear input
			setInputKey((k) => k + 1);
		},
		[isLoading, isPlanProcessing, planModeEnabled, currentPlan, sendMessage, createPlanFromPrompt]
	);

	// Determine current status for inline status bar
	const getStatus = (): 'idle' | 'thinking' | 'tool' | 'responding' => {
		if (!isLoading) return 'idle';

		const runningTools = currentToolCalls.filter((tc) => tc.status === 'running');
		if (runningTools.length > 0) return 'tool';

		if (streamingEntry) return 'responding';

		return 'thinking';
	};

	const currentStatus = getStatus();
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
			<TimelineView entries={displayTimeline} streamingEntry={displayStreamingEntry} isLoading={isLoading} />

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

			{/* Input field */}
			{!currentPlan && (
				<Box>
					<Text color={planModeEnabled ? 'cyan' : color} bold>
						{planModeEnabled ? '📋 ' : '> '}
					</Text>
					<TextInput
						key={inputKey}
						placeholder={
							isLoading || isPlanProcessing
								? 'Processing...'
								: planModeEnabled
									? 'Describe your task (will create plan first)...'
									: placeholder
						}
						onSubmit={handleSubmit}
						isDisabled={isLoading || isPlanProcessing}
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

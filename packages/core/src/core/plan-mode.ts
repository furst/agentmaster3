/**
 * Plan Mode Hook
 *
 * Encapsulates all plan mode state and logic for AgentShell.
 * Handles plan creation, editing, approval, and cancellation.
 *
 * Supports two modes:
 * 1. User-initiated: Toggle via Shift+Tab, agent creates structured plan
 * 2. Tool-initiated: Agent calls enter_plan_mode/exit_plan_mode tools
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
	createPlan,
	approvePlan,
	cancelPlan,
	parsePlanFromText,
	loadPlan,
	clearPlan,
	type Plan,
} from './session-plan.js';
import type { Agent } from './agent.js';
import {
	planModeEvents,
	sendPlanApproval,
	forcePlanModeExit,
	type PlanModeEnterEvent,
	type PlanModeExitEvent,
} from '../tools/plan-mode.js';

// Planning prompt markers for filtering in UI
export const PLAN_PROMPT_MARKERS = [
	'You are in PLANNING MODE',
	'Revise the plan based on this feedback:',
	'The user has approved this plan. Now execute it',
];

/**
 * Check if a message is an internal planning prompt that should be hidden
 */
export function isPlanningMessage(content: string): boolean {
	return PLAN_PROMPT_MARKERS.some((marker) => content.startsWith(marker));
}

// Plan creation prompt template
const PLAN_CREATION_PROMPT = `You are in PLANNING MODE. Your job is to create an informed, concrete plan.

User request: "{PROMPT}"

IMPORTANT: Do research FIRST, then plan.

1. RESEARCH PHASE: Use your tools to gather the information needed to understand the task
   - Read relevant files, fetch pages, check current state
   - Get concrete details that will inform your plan
   - Do NOT skip this step - generic plans are useless

2. PLANNING PHASE: Create a specific plan based on what you found
   - Reference actual items/data you discovered (not placeholders)
   - Be specific about what needs to be done for each item

Format your FINAL output EXACTLY like this:
**Objective:** [Specific objective based on what you found]

**Steps:**
1. [Concrete step referencing actual data discovered]
2. [Next step]
...

EXAMPLE - If asked "research the latest developments in quantum computing":
- BAD: "1. Search for quantum computing 2. Read articles 3. Summarize"
- GOOD: First SEARCH for recent news, find "IBM announced 1000+ qubit processor, Google claims quantum advantage", then plan:
  "1. Research IBM's Condor processor announcement and specs 2. Compare Google's quantum supremacy claims 3. ..."

Do your research now, then output the plan.`;

interface Message {
	role: 'user' | 'assistant';
	content: string;
}

interface SendMessageOptions {
	skipUserMessage?: boolean;
}

export interface UsePlanModeOptions {
	agent: Agent;
	sendMessage: (message: string, options?: SendMessageOptions) => Promise<void>;
	addUserMessage: (content: string) => void;
	messages: Message[];
}

export interface UsePlanModeResult {
	// State
	planModeEnabled: boolean;
	currentPlan: Plan | null;
	isPlanProcessing: boolean;
	// Tool-initiated plan state
	toolPlanId: string | null;
	toolPlanSummary: string | null;

	// Actions
	togglePlanMode: () => void;
	createPlanFromPrompt: (prompt: string) => Promise<void>;
	handlePlanApprove: () => void;
	handlePlanEdit: (feedback: string) => Promise<void>;
	handlePlanCancel: () => void;
	resetPlanState: () => void;

	// For initialization
	loadExistingPlan: () => Plan | null;
}

/**
 * Custom hook for managing plan mode state and logic
 */
export function usePlanMode({
	agent,
	sendMessage,
	addUserMessage,
	messages,
}: UsePlanModeOptions): UsePlanModeResult {
	const [planModeEnabled, setPlanModeEnabled] = useState(false);
	const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
	const [isPlanProcessing, setIsPlanProcessing] = useState(false);
	const pendingPromptRef = useRef<string | null>(null);

	// Tool-initiated plan mode state
	const [toolPlanId, setToolPlanId] = useState<string | null>(null);
	const [toolPlanSummary, setToolPlanSummary] = useState<string | null>(null);

	// Listen to tool-initiated plan mode events
	useEffect(() => {
		const handleEnter = (event: PlanModeEnterEvent) => {
			setToolPlanId(event.id);
			setPlanModeEnabled(true);
		};

		const handleExit = (event: PlanModeExitEvent) => {
			if (event.id === toolPlanId) {
				setToolPlanSummary(event.summary || 'Plan ready for execution');
			}
		};

		planModeEvents.on('enter', handleEnter);
		planModeEvents.on('exit', handleExit);

		return () => {
			planModeEvents.off('enter', handleEnter);
			planModeEvents.off('exit', handleExit);
		};
	}, [toolPlanId]);

	// Parse plan from agent response when processing completes
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

	// Load existing plan (for initialization)
	const loadExistingPlan = useCallback((): Plan | null => {
		const existingPlan = loadPlan(agent.getSessionId());
		if (existingPlan && existingPlan.status === 'draft') {
			setCurrentPlan(existingPlan);
			setPlanModeEnabled(true);
			return existingPlan;
		}
		return null;
	}, [agent]);

	// Toggle plan mode
	const togglePlanMode = useCallback(() => {
		setPlanModeEnabled((prev) => !prev);
	}, []);

	// Create a plan from user prompt
	const createPlanFromPrompt = useCallback(
		async (prompt: string) => {
			setIsPlanProcessing(true);
			pendingPromptRef.current = prompt;

			// Add user's actual prompt to timeline first
			addUserMessage(prompt);

			// Build the plan prompt
			const planPrompt = PLAN_CREATION_PROMPT.replace('{PROMPT}', prompt);

			try {
				// Send plan prompt without adding to timeline (internal message)
				await sendMessage(planPrompt, { skipUserMessage: true });
			} finally {
				setIsPlanProcessing(false);
			}
		},
		[sendMessage, addUserMessage]
	);

	// Handle plan approval (both user-initiated and tool-initiated)
	const handlePlanApprove = useCallback(() => {
		// Tool-initiated plan approval
		if (toolPlanId && toolPlanSummary) {
			sendPlanApproval(toolPlanId, true);
			setToolPlanId(null);
			setToolPlanSummary(null);
			setPlanModeEnabled(false);
			return;
		}

		// User-initiated (structured) plan approval
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
	}, [currentPlan, agent, sendMessage, toolPlanId, toolPlanSummary]);

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

	// Handle plan cancellation (both user-initiated and tool-initiated)
	const handlePlanCancel = useCallback(() => {
		// Tool-initiated plan cancellation
		if (toolPlanId) {
			sendPlanApproval(toolPlanId, false, 'User cancelled the plan');
			setToolPlanId(null);
			setToolPlanSummary(null);
			setPlanModeEnabled(false);
			return;
		}

		// User-initiated plan cancellation
		if (currentPlan) {
			cancelPlan(agent.getSessionId());
		}
		setCurrentPlan(null);
		setPlanModeEnabled(false);
		pendingPromptRef.current = null;
	}, [currentPlan, agent, toolPlanId]);

	// Reset all plan state (for conversation reset)
	const resetPlanState = useCallback(() => {
		// Clean up tool-initiated state
		if (toolPlanId) {
			forcePlanModeExit();
		}
		setToolPlanId(null);
		setToolPlanSummary(null);

		// Clean up user-initiated state
		setCurrentPlan(null);
		setPlanModeEnabled(false);
		pendingPromptRef.current = null;
		clearPlan(agent.getSessionId());
	}, [agent, toolPlanId]);

	return {
		// State
		planModeEnabled,
		currentPlan,
		isPlanProcessing,
		toolPlanId,
		toolPlanSummary,

		// Actions
		togglePlanMode,
		createPlanFromPrompt,
		handlePlanApprove,
		handlePlanEdit,
		handlePlanCancel,
		resetPlanState,
		loadExistingPlan,
	};
}

/**
 * Plan Mode Hook
 *
 * Encapsulates all plan mode state and logic for AgentShell.
 * Handles plan creation, editing, approval, and cancellation.
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
import type { Agent, AgentStats } from './agent.js';

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

EXAMPLE - If asked "research my newsletter recommendations":
- BAD: "1. Read newsletter 2. Research recommendations 3. Compare to portfolio"
- GOOD: First READ the newsletter, find "NVDA, ASML, LRCX mentioned", then plan:
  "1. Research NVDA's AI thesis and valuation 2. Analyze ASML's moat in EUV 3. ..."

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

	// Reset all plan state (for conversation reset)
	const resetPlanState = useCallback(() => {
		setCurrentPlan(null);
		setPlanModeEnabled(false);
		pendingPromptRef.current = null;
		clearPlan(agent.getSessionId());
	}, [agent]);

	return {
		// State
		planModeEnabled,
		currentPlan,
		isPlanProcessing,

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

import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { EventEmitter } from 'events';

// ============================================================================
// Event-based plan mode coordination
// ============================================================================

/**
 * Global event emitter for plan mode state changes.
 * The agent emits events, UI listens and responds.
 */
export const planModeEvents = new EventEmitter();

export interface PlanModeEnterEvent {
	id: string;
	timestamp: number;
}

export interface PlanModeExitEvent {
	id: string;
	summary?: string;
	timestamp: number;
}

export interface PlanModeApprovalEvent {
	id: string;
	approved: boolean;
	feedback?: string;
}

// Track plan mode state
let isPlanModeActive = false;
let currentPlanId: string | null = null;
let planIdCounter = 0;

function generatePlanId(): string {
	return `plan_${Date.now()}_${++planIdCounter}`;
}

// ============================================================================
// EnterPlanMode Tool
// ============================================================================

/**
 * Tool for entering plan mode.
 * When called, the agent switches to read-only mode for planning.
 */
export const enterPlanModeTool = defineTool({
	name: 'enter_plan_mode',
	description: `Enter planning mode for complex tasks. Use this when:
- The task requires multiple steps
- You need to explore and understand before implementing
- You want user approval before making changes

While in plan mode:
- Only use read-only tools (search, read, fetch)
- Explore the problem space
- Design your approach
- Call exit_plan_mode when ready with your plan summary`,
	parameters: z.object({}),
	execute: async () => {
		if (isPlanModeActive) {
			return {
				success: false,
				error: 'Already in plan mode. Call exit_plan_mode first.',
			};
		}

		const planId = generatePlanId();
		isPlanModeActive = true;
		currentPlanId = planId;

		// Emit event for UI to show plan mode indicator
		const event: PlanModeEnterEvent = {
			id: planId,
			timestamp: Date.now(),
		};
		planModeEvents.emit('enter', event);

		return {
			success: true,
			planId,
			message: 'Plan mode activated. Use read-only tools to explore and plan. Call exit_plan_mode when ready.',
		};
	},
});

// ============================================================================
// ExitPlanMode Tool
// ============================================================================

/**
 * Wait for user approval of the plan
 */
function waitForApproval(planId: string, timeoutMs: number = 300000): Promise<PlanModeApprovalEvent> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			planModeEvents.removeListener('approval', handler);
			reject(new Error('Plan approval timed out'));
		}, timeoutMs);

		const handler = (approval: PlanModeApprovalEvent) => {
			if (approval.id === planId) {
				clearTimeout(timeout);
				planModeEvents.removeListener('approval', handler);
				resolve(approval);
			}
		};

		planModeEvents.on('approval', handler);
	});
}

/**
 * Tool for exiting plan mode with a plan summary.
 * The user can approve or reject the plan before execution proceeds.
 */
export const exitPlanModeTool = defineTool({
	name: 'exit_plan_mode',
	description: `Exit planning mode and present your plan for user approval.
Call this when you have:
- Explored the problem space
- Identified the key files/areas involved
- Designed a concrete implementation approach

The user will see your plan summary and can:
- Approve: You can proceed with execution
- Reject: You remain in plan mode to revise

Include a clear, actionable plan summary.`,
	parameters: z.object({
		plan_summary: z
			.string()
			.describe('Summary of your plan. Include: objective, key steps, files to modify, approach.'),
	}),
	execute: async ({ plan_summary }) => {
		if (!isPlanModeActive || !currentPlanId) {
			return {
				success: false,
				error: 'Not in plan mode. Call enter_plan_mode first.',
			};
		}

		const planId = currentPlanId;

		// Emit exit event with plan summary for UI to show
		const exitEvent: PlanModeExitEvent = {
			id: planId,
			summary: plan_summary,
			timestamp: Date.now(),
		};
		planModeEvents.emit('exit', exitEvent);

		try {
			// Wait for user approval
			const approval = await waitForApproval(planId);

			if (approval.approved) {
				// User approved - exit plan mode
				isPlanModeActive = false;
				currentPlanId = null;

				return {
					success: true,
					planId,
					approved: true,
					message: 'Plan approved. You may now proceed with execution.',
				};
			} else {
				// User rejected - stay in plan mode
				return {
					success: true,
					planId,
					approved: false,
					feedback: approval.feedback,
					message: 'Plan not approved. Revise based on feedback and call exit_plan_mode again.',
				};
			}
		} catch (error) {
			return {
				success: false,
				planId,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// State accessors and helpers
// ============================================================================

/**
 * Check if plan mode is currently active
 */
export function isInPlanMode(): boolean {
	return isPlanModeActive;
}

/**
 * Get the current plan ID (if in plan mode)
 */
export function getCurrentPlanId(): string | null {
	return currentPlanId;
}

/**
 * Send approval/rejection for a pending plan.
 * Call this from the UI when user makes a decision.
 */
export function sendPlanApproval(planId: string, approved: boolean, feedback?: string): void {
	const event: PlanModeApprovalEvent = {
		id: planId,
		approved,
		feedback,
	};
	planModeEvents.emit('approval', event);
}

/**
 * Force exit plan mode (for reset/cancel scenarios)
 */
export function forcePlanModeExit(): void {
	if (currentPlanId) {
		// Send rejection to unblock any waiting exit_plan_mode
		sendPlanApproval(currentPlanId, false, 'Plan mode cancelled');
	}
	isPlanModeActive = false;
	currentPlanId = null;
}

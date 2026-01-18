import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { agentEvents } from './events.js';
import { createTodos } from './session-todo.js';

// ============================================================================
// Types
// ============================================================================

export interface PlanStep {
	id: string;
	description: string;
	details?: string;
}

export interface Plan {
	sessionId: string;
	originalPrompt: string;
	objective: string;
	steps: PlanStep[];
	status: 'draft' | 'approved' | 'executing' | 'completed' | 'cancelled';
	createdAt: number;
	updatedAt: number;
	approvedAt?: number;
}

// ============================================================================
// Storage Paths
// ============================================================================

const SESSIONS_DIR = join(homedir(), '.config', 'conductor', 'sessions');

function getSessionDir(sessionId: string): string {
	return join(SESSIONS_DIR, sessionId);
}

function getPlanPath(sessionId: string): string {
	return join(getSessionDir(sessionId), 'plan.json');
}

function ensureSessionDir(sessionId: string): void {
	const dir = getSessionDir(sessionId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

// ============================================================================
// ID Generation
// ============================================================================

let stepIdCounter = 0;

export function generateStepId(): string {
	return `step_${Date.now()}_${++stepIdCounter}`;
}

// ============================================================================
// Event Emission
// ============================================================================

function emitPlanUpdate(
	sessionId: string,
	action: 'create' | 'update' | 'approve' | 'cancel' | 'complete',
	plan: Plan | null
): void {
	agentEvents.emit({
		type: 'planUpdate',
		sessionId,
		action,
		plan: plan
			? {
					objective: plan.objective,
					steps: plan.steps.map((s) => ({
						id: s.id,
						description: s.description,
					})),
					status: plan.status,
				}
			: null,
		timestamp: Date.now(),
	});
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Load plan for a session from disk
 */
export function loadPlan(sessionId: string): Plan | null {
	const path = getPlanPath(sessionId);

	if (!existsSync(path)) {
		return null;
	}

	try {
		const content = readFileSync(path, 'utf-8');
		return JSON.parse(content) as Plan;
	} catch {
		return null;
	}
}

/**
 * Save plan to disk
 */
export function savePlan(plan: Plan): void {
	ensureSessionDir(plan.sessionId);
	const path = getPlanPath(plan.sessionId);
	writeFileSync(path, JSON.stringify(plan, null, 2), 'utf-8');
}

/**
 * Create a new plan from agent output
 */
export function createPlan(
	sessionId: string,
	originalPrompt: string,
	objective: string,
	steps: Array<{ description: string; details?: string }>
): Plan {
	const now = Date.now();

	const plan: Plan = {
		sessionId,
		originalPrompt,
		objective,
		steps: steps.map((s) => ({
			id: generateStepId(),
			description: s.description,
			details: s.details,
		})),
		status: 'draft',
		createdAt: now,
		updatedAt: now,
	};

	savePlan(plan);
	emitPlanUpdate(sessionId, 'create', plan);

	return plan;
}

/**
 * Update an existing plan (e.g., after user edits)
 */
export function updatePlan(
	sessionId: string,
	objective: string,
	steps: Array<{ description: string; details?: string }>
): Plan | null {
	const plan = loadPlan(sessionId);
	if (!plan) {
		return null;
	}

	const now = Date.now();
	plan.objective = objective;
	plan.steps = steps.map((s) => ({
		id: generateStepId(),
		description: s.description,
		details: s.details,
	}));
	plan.updatedAt = now;

	savePlan(plan);
	emitPlanUpdate(sessionId, 'update', plan);

	return plan;
}

export interface ApprovedPlanResult {
	plan: Plan;
	todoIds: string[];
}

/**
 * Approve a plan and convert steps to todos
 * Returns the plan and the todo IDs for the agent to update
 */
export function approvePlan(sessionId: string, agentName: string): ApprovedPlanResult | null {
	const plan = loadPlan(sessionId);
	if (!plan || plan.status !== 'draft') {
		return null;
	}

	const now = Date.now();
	plan.status = 'approved';
	plan.approvedAt = now;
	plan.updatedAt = now;

	savePlan(plan);
	emitPlanUpdate(sessionId, 'approve', plan);

	// Convert plan steps to todos
	const todoItems = plan.steps.map((s) => s.description);
	const todoList = createTodos(sessionId, agentName, todoItems);

	// Get the IDs of the newly created todos (last N items where N = plan steps)
	const todoIds = todoList.todos.slice(-plan.steps.length).map((t) => t.id);

	return { plan, todoIds };
}

/**
 * Mark plan as executing
 */
export function startPlanExecution(sessionId: string): Plan | null {
	const plan = loadPlan(sessionId);
	if (!plan || plan.status !== 'approved') {
		return null;
	}

	plan.status = 'executing';
	plan.updatedAt = Date.now();

	savePlan(plan);
	return plan;
}

/**
 * Cancel a plan
 */
export function cancelPlan(sessionId: string): void {
	const plan = loadPlan(sessionId);
	if (plan) {
		plan.status = 'cancelled';
		plan.updatedAt = Date.now();
		savePlan(plan);
		emitPlanUpdate(sessionId, 'cancel', plan);
	}
}

/**
 * Clear plan for a session
 */
export function clearPlan(sessionId: string): void {
	const path = getPlanPath(sessionId);
	if (existsSync(path)) {
		// Just mark as cancelled rather than delete
		cancelPlan(sessionId);
	}
}

/**
 * Parse plan from agent text response
 * Expects format like:
 * **Objective:** ...
 * **Steps:**
 * 1. Step one
 * 2. Step two
 */
export function parsePlanFromText(text: string): {
	objective: string;
	steps: Array<{ description: string; details?: string }>;
} | null {
	// Try to extract objective
	const objectiveMatch = text.match(
		/\*?\*?Objective\*?\*?:?\s*(.+?)(?=\n\*?\*?Steps|\n\n|\n\d\.)/is
	);
	const objective = objectiveMatch?.[1]?.trim() || 'Execute the requested task';

	// Try to extract numbered steps
	const stepsMatch = text.match(/(?:\*?\*?Steps\*?\*?:?\s*)?((?:\d+\.\s+.+\n?)+)/is);
	if (!stepsMatch || !stepsMatch[1]) {
		// Try bullet points
		const bulletMatch = text.match(/((?:[-*]\s+.+\n?)+)/is);
		if (!bulletMatch || !bulletMatch[1]) {
			return null;
		}
		const steps = bulletMatch[1]
			.split(/\n/)
			.map((line) => line.replace(/^[-*]\s+/, '').trim())
			.filter((line) => line.length > 0)
			.map((description) => ({ description }));

		if (steps.length === 0) return null;
		return { objective, steps };
	}

	const steps = stepsMatch[1]
		.split(/\n/)
		.map((line) => line.replace(/^\d+\.\s+/, '').trim())
		.filter((line) => line.length > 0)
		.map((description) => ({ description }));

	if (steps.length === 0) return null;
	return { objective, steps };
}

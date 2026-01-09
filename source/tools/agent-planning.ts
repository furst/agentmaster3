import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { getFinanceConfig } from '../core/project-config.js';

interface PlanStep {
	id: number;
	description: string;
	status: 'pending' | 'in_progress' | 'completed' | 'skipped';
	findings?: string;
	completedAt?: string;
}

interface ResearchPlan {
	id: string;
	title: string;
	objective: string;
	steps: PlanStep[];
	createdAt: string;
	updatedAt: string;
	status: 'active' | 'completed' | 'abandoned';
}

function getResearchDir(): string {
	const config = getFinanceConfig();
	return config.researchDirectory;
}

function generatePlanId(): string {
	return `plan-${Date.now().toString(36)}`;
}

function getCurrentPlanPath(): string {
	return join(getResearchDir(), 'current-plan.json');
}

/**
 * Create plan tool - creates a research plan with numbered steps
 */
export const createPlanTool = defineTool({
	name: 'create_plan',
	description:
		'Create a structured research plan with numbered steps. Use this at the start of complex research tasks to organize your work. Only one plan can be active at a time.',
	parameters: z.object({
		title: z.string().describe('Short title for the plan (e.g., "Portfolio Analysis", "AAPL Deep Dive")'),
		objective: z.string().describe('The main goal or question to answer'),
		steps: z
			.array(z.string())
			.min(1)
			.max(20)
			.describe('List of steps to complete (will be numbered automatically)'),
	}),
	execute: async ({ title, objective, steps }) => {
		try {
			const researchDir = getResearchDir();

			// Ensure directory exists
			if (!existsSync(researchDir)) {
				await mkdir(researchDir, { recursive: true });
			}

			const planPath = getCurrentPlanPath();
			const now = new Date().toISOString();

			// Check for existing active plan
			if (existsSync(planPath)) {
				const existing = JSON.parse(await readFile(planPath, 'utf-8')) as ResearchPlan;
				if (existing.status === 'active') {
					return {
						success: false,
						error: `An active plan already exists: "${existing.title}". Complete or abandon it first using update_plan_step.`,
						existingPlanId: existing.id,
					};
				}
			}

			const plan: ResearchPlan = {
				id: generatePlanId(),
				title,
				objective,
				steps: steps.map((desc, idx) => ({
					id: idx + 1,
					description: desc,
					status: 'pending',
				})),
				createdAt: now,
				updatedAt: now,
				status: 'active',
			};

			await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');

			return {
				success: true,
				planId: plan.id,
				title: plan.title,
				objective: plan.objective,
				stepCount: plan.steps.length,
				steps: plan.steps.map((s) => `${s.id}. [${s.status}] ${s.description}`),
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

/**
 * Update plan step tool - mark steps complete, add findings
 */
export const updatePlanStepTool = defineTool({
	name: 'update_plan_step',
	description:
		'Update the status of a plan step. Use this to mark steps as in_progress, completed (with findings), or skipped. Can also abandon the entire plan.',
	parameters: z.object({
		stepId: z.number().optional().describe('The step number to update (1-based)'),
		status: z
			.enum(['in_progress', 'completed', 'skipped'])
			.optional()
			.describe('New status for the step'),
		findings: z.string().optional().describe('Key findings or results from this step (for completed steps)'),
		abandonPlan: z.boolean().optional().describe('Set to true to abandon the entire plan'),
		completePlan: z.boolean().optional().describe('Set to true to mark the entire plan as completed'),
	}),
	execute: async ({ stepId, status, findings, abandonPlan, completePlan }) => {
		try {
			const planPath = getCurrentPlanPath();

			if (!existsSync(planPath)) {
				return {
					success: false,
					error: 'No active plan exists. Create one with create_plan first.',
				};
			}

			const plan = JSON.parse(await readFile(planPath, 'utf-8')) as ResearchPlan;

			if (plan.status !== 'active') {
				return {
					success: false,
					error: `Plan is already ${plan.status}. Create a new plan to continue.`,
				};
			}

			const now = new Date().toISOString();

			// Handle plan-level actions
			if (abandonPlan) {
				plan.status = 'abandoned';
				plan.updatedAt = now;
				await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
				return {
					success: true,
					action: 'plan_abandoned',
					planId: plan.id,
					message: 'Plan has been abandoned. You can create a new plan.',
				};
			}

			if (completePlan) {
				plan.status = 'completed';
				plan.updatedAt = now;
				await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
				return {
					success: true,
					action: 'plan_completed',
					planId: plan.id,
					completedSteps: plan.steps.filter((s) => s.status === 'completed').length,
					totalSteps: plan.steps.length,
				};
			}

			// Update specific step
			if (!stepId || !status) {
				return {
					success: false,
					error: 'Provide stepId and status to update a step, or use abandonPlan/completePlan.',
				};
			}

			const step = plan.steps.find((s) => s.id === stepId);
			if (!step) {
				return {
					success: false,
					error: `Step ${stepId} not found. Valid steps: 1-${plan.steps.length}`,
				};
			}

			step.status = status;
			if (status === 'completed') {
				step.completedAt = now;
				if (findings) {
					step.findings = findings;
				}
			}
			plan.updatedAt = now;

			// Check if all steps are done
			const allDone = plan.steps.every((s) => s.status === 'completed' || s.status === 'skipped');
			if (allDone) {
				plan.status = 'completed';
			}

			await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');

			return {
				success: true,
				action: 'step_updated',
				stepId,
				stepDescription: step.description,
				newStatus: status,
				findings: findings || undefined,
				planCompleted: allDone,
				progress: `${plan.steps.filter((s) => s.status === 'completed').length}/${plan.steps.length} steps completed`,
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

/**
 * Read plan tool - read current plan status
 */
export const readPlanTool = defineTool({
	name: 'read_plan',
	description:
		'Read the current research plan status. Shows all steps, their status, and any findings recorded.',
	parameters: z.object({}),
	execute: async () => {
		try {
			const planPath = getCurrentPlanPath();

			if (!existsSync(planPath)) {
				return {
					success: true,
					hasActivePlan: false,
					message: 'No plan exists. Create one with create_plan to organize complex research.',
				};
			}

			const plan = JSON.parse(await readFile(planPath, 'utf-8')) as ResearchPlan;

			const completedSteps = plan.steps.filter((s) => s.status === 'completed').length;
			const inProgressSteps = plan.steps.filter((s) => s.status === 'in_progress').length;

			return {
				success: true,
				hasActivePlan: plan.status === 'active',
				planId: plan.id,
				title: plan.title,
				objective: plan.objective,
				status: plan.status,
				progress: `${completedSteps}/${plan.steps.length} completed`,
				inProgress: inProgressSteps,
				createdAt: plan.createdAt,
				updatedAt: plan.updatedAt,
				steps: plan.steps.map((s) => ({
					id: s.id,
					description: s.description,
					status: s.status,
					findings: s.findings,
					completedAt: s.completedAt,
				})),
			};
		} catch (error) {
			return {
				success: false,
				error: (error as Error).message,
			};
		}
	},
});

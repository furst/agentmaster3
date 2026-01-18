import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { EventEmitter } from 'events';

// ============================================================================
// Event-based user interaction
// ============================================================================

/**
 * Global event emitter for ask-user-question interactions.
 * The tool emits 'question' events and waits for 'answer' events.
 */
export const askUserEvents = new EventEmitter();

export interface QuestionOption {
	label: string;
	value: string;
	description?: string;
}

export interface QuestionEvent {
	id: string;
	question: string;
	options?: QuestionOption[];
	multiSelect?: boolean;
}

export interface AnswerEvent {
	id: string;
	selection: string;
	isCustom: boolean;
	selectedValues?: string[];
}

// ============================================================================
// Helper to wait for user answer
// ============================================================================

let questionIdCounter = 0;

/**
 * Generate a unique question ID
 */
function generateQuestionId(): string {
	return `q_${Date.now()}_${++questionIdCounter}`;
}

/**
 * Wait for a user answer to a specific question
 */
function waitForAnswer(questionId: string, timeoutMs: number = 300000): Promise<AnswerEvent> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			askUserEvents.removeListener('answer', handler);
			reject(new Error('Question timed out waiting for user response'));
		}, timeoutMs);

		const handler = (answer: AnswerEvent) => {
			if (answer.id === questionId) {
				clearTimeout(timeout);
				askUserEvents.removeListener('answer', handler);
				resolve(answer);
			}
		};

		askUserEvents.on('answer', handler);
	});
}

// ============================================================================
// AskUserQuestion Tool
// ============================================================================

/**
 * Tool for asking the user questions during agent execution.
 * Emits a 'question' event and waits for an 'answer' event.
 *
 * The UI component (e.g., AgentShell) should listen for 'question' events
 * and emit 'answer' events when the user responds.
 */
export const askUserQuestionTool = defineTool({
	name: 'ask_user_question',
	description: `Ask the user a question to clarify requirements, get preferences, or make decisions.
Use this when you need user input before proceeding.

The question will be displayed with numbered options if provided, or as a free-text prompt.
The user can select a numbered option or type a custom response.`,
	parameters: z.object({
		question: z
			.string()
			.describe('The question to ask the user. Should be clear and specific.'),
		options: z
			.array(
				z.object({
					label: z.string().describe('Short display text for this option'),
					value: z.string().describe('Value returned when selected'),
					description: z.string().optional().describe('Additional context for this option'),
				})
			)
			.optional()
			.describe('Optional list of choices. If not provided, user can type free-form response.'),
		multiSelect: z
			.boolean()
			.optional()
			.default(false)
			.describe('Allow multiple selections (only applies when options are provided)'),
	}),
	execute: async ({ question, options, multiSelect }) => {
		const questionId = generateQuestionId();

		// Emit the question event for the UI to display
		const questionEvent: QuestionEvent = {
			id: questionId,
			question,
			options,
			multiSelect,
		};
		askUserEvents.emit('question', questionEvent);

		try {
			// Wait for the user to answer
			const answer = await waitForAnswer(questionId);

			return {
				success: true,
				questionId,
				question,
				selection: answer.selection,
				isCustom: answer.isCustom,
				selectedValues: answer.selectedValues,
			};
		} catch (error) {
			return {
				success: false,
				questionId,
				question,
				error: (error as Error).message,
			};
		}
	},
});

// ============================================================================
// Helper for UI components to send answers
// ============================================================================

/**
 * Send an answer to a pending question.
 * Call this from the UI component when the user responds.
 */
export function sendAnswer(answer: AnswerEvent): void {
	askUserEvents.emit('answer', answer);
}

/**
 * Check if there's a pending question waiting for an answer.
 * Returns the question event if one is pending, or null.
 */
export function getPendingQuestion(): QuestionEvent | null {
	return pendingQuestion;
}

// Track current pending question for UI components to check
let pendingQuestion: QuestionEvent | null = null;

// Update pending question state when events occur
askUserEvents.on('question', (event: QuestionEvent) => {
	pendingQuestion = event;
});

askUserEvents.on('answer', () => {
	pendingQuestion = null;
});

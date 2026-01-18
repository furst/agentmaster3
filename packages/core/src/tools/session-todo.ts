import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import {
	createTodos,
	updateTodoStatus,
	loadTodos,
	clearTodos,
} from '../core/session-todo.js';

/**
 * Create todos - creates a list of todo items for the current session
 */
export const createTodosTool = defineTool({
	name: 'create_todos',
	description: `Create a todo list for tracking complex multi-step tasks. Use when:
- Task has 3+ distinct steps
- Multi-part research or analysis
- Sequential operations that need tracking

DO NOT use for simple single-step tasks or quick lookups.`,
	parameters: z.object({
		items: z
			.array(z.string().min(1))
			.min(1)
			.max(20)
			.describe('List of todo items (tasks to complete)'),
	}),
	execute: async ({ items }, context) => {
		if (!context?.sessionId) {
			return { success: false, error: 'No session ID available' };
		}

		const todoList = createTodos(context.sessionId, 'agent', items);

		return {
			success: true,
			sessionId: context.sessionId,
			todoCount: todoList.todos.length,
			todos: todoList.todos.map((t) => ({
				id: t.id,
				content: t.content,
				status: t.status,
			})),
		};
	},
});

/**
 * Update todo - update status of a specific todo item
 */
export const updateTodoTool = defineTool({
	name: 'update_todo',
	description:
		'Update the status of a todo item. Mark as in_progress when starting work, completed when done.',
	parameters: z.object({
		todoId: z.string().describe('The todo item ID to update'),
		status: z
			.enum(['in_progress', 'completed'])
			.describe('New status for the todo'),
	}),
	execute: async ({ todoId, status }, context) => {
		if (!context?.sessionId) {
			return { success: false, error: 'No session ID available' };
		}

		const todoList = updateTodoStatus(context.sessionId, todoId, status);
		if (!todoList) {
			return { success: false, error: 'Todo not found or no active list' };
		}

		const updatedTodo = todoList.todos.find((t) => t.id === todoId);
		const completed = todoList.todos.filter(
			(t) => t.status === 'completed'
		).length;

		return {
			success: true,
			todoId,
			newStatus: status,
			content: updatedTodo?.content,
			progress: `${completed}/${todoList.todos.length}`,
		};
	},
});

/**
 * Get todos - read current todo list status
 */
export const getTodosTool = defineTool({
	name: 'get_todos',
	description: 'Get the current todo list and progress for this session.',
	parameters: z.object({}),
	execute: async (_params, context) => {
		if (!context?.sessionId) {
			return { success: false, error: 'No session ID available' };
		}

		const todoList = loadTodos(context.sessionId);
		if (!todoList || todoList.todos.length === 0) {
			return {
				success: true,
				hasTodos: false,
				message: 'No active todo list',
			};
		}

		const completed = todoList.todos.filter(
			(t) => t.status === 'completed'
		).length;
		const inProgress = todoList.todos.filter(
			(t) => t.status === 'in_progress'
		).length;

		return {
			success: true,
			hasTodos: true,
			progress: `${completed}/${todoList.todos.length}`,
			inProgress,
			todos: todoList.todos.map((t) => ({
				id: t.id,
				content: t.content,
				status: t.status,
			})),
		};
	},
});

/**
 * Clear todos - clear all todos for this session
 */
export const clearTodosTool = defineTool({
	name: 'clear_todos',
	description: 'Clear all todos for this session. Use when starting fresh.',
	parameters: z.object({}),
	execute: async (_params, context) => {
		if (!context?.sessionId) {
			return { success: false, error: 'No session ID available' };
		}

		clearTodos(context.sessionId);

		return {
			success: true,
			message: 'All todos cleared',
		};
	},
});

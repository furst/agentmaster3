import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { agentEvents } from './events.js';

// ============================================================================
// Types
// ============================================================================

export interface TodoItem {
	id: string;
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
	createdAt: number;
	updatedAt: number;
	completedAt?: number;
}

export interface TodoList {
	sessionId: string;
	agentName: string;
	todos: TodoItem[];
	createdAt: number;
	updatedAt: number;
}

// ============================================================================
// Storage Paths
// ============================================================================

const SESSIONS_DIR = join(homedir(), '.config', 'agentmaster', 'sessions');

function getSessionDir(sessionId: string): string {
	return join(SESSIONS_DIR, sessionId);
}

function getTodoPath(sessionId: string): string {
	return join(getSessionDir(sessionId), 'todos.json');
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

let todoIdCounter = 0;

export function generateTodoId(): string {
	return `todo_${Date.now()}_${++todoIdCounter}`;
}

// ============================================================================
// Event Emission
// ============================================================================

function emitTodoUpdate(
	sessionId: string,
	action: 'create' | 'update' | 'complete' | 'clear',
	todos: TodoItem[]
): void {
	agentEvents.emit({
		type: 'todoUpdate',
		sessionId,
		action,
		todos: todos.map((t) => ({
			id: t.id,
			content: t.content,
			status: t.status,
		})),
		timestamp: Date.now(),
	});
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Load todos for a session from disk
 */
export function loadTodos(sessionId: string): TodoList | null {
	const path = getTodoPath(sessionId);

	if (!existsSync(path)) {
		return null;
	}

	try {
		const content = readFileSync(path, 'utf-8');
		return JSON.parse(content) as TodoList;
	} catch {
		return null;
	}
}

/**
 * Save todos to disk
 */
export function saveTodos(todoList: TodoList): void {
	ensureSessionDir(todoList.sessionId);
	const path = getTodoPath(todoList.sessionId);
	writeFileSync(path, JSON.stringify(todoList, null, 2), 'utf-8');
}

/**
 * Create a new todo list for a session
 * Returns existing list if one already exists
 */
export function createTodos(
	sessionId: string,
	agentName: string,
	items: string[]
): TodoList {
	const now = Date.now();

	// Check for existing list
	const existing = loadTodos(sessionId);
	if (existing && existing.todos.length > 0) {
		// Add to existing list rather than replace
		const newTodos: TodoItem[] = items.map((content) => ({
			id: generateTodoId(),
			content,
			status: 'pending' as const,
			createdAt: now,
			updatedAt: now,
		}));

		existing.todos.push(...newTodos);
		existing.updatedAt = now;

		saveTodos(existing);
		emitTodoUpdate(sessionId, 'create', existing.todos);

		return existing;
	}

	// Create new list
	const todoList: TodoList = {
		sessionId,
		agentName,
		todos: items.map((content) => ({
			id: generateTodoId(),
			content,
			status: 'pending' as const,
			createdAt: now,
			updatedAt: now,
		})),
		createdAt: now,
		updatedAt: now,
	};

	saveTodos(todoList);
	emitTodoUpdate(sessionId, 'create', todoList.todos);

	return todoList;
}

/**
 * Update the status of a specific todo
 */
export function updateTodoStatus(
	sessionId: string,
	todoId: string,
	status: TodoItem['status']
): TodoList | null {
	const todoList = loadTodos(sessionId);
	if (!todoList) {
		return null;
	}

	const todo = todoList.todos.find((t) => t.id === todoId);
	if (!todo) {
		return null;
	}

	const now = Date.now();
	todo.status = status;
	todo.updatedAt = now;

	if (status === 'completed') {
		todo.completedAt = now;
	}

	todoList.updatedAt = now;
	saveTodos(todoList);

	const action = status === 'completed' ? 'complete' : 'update';
	emitTodoUpdate(sessionId, action, todoList.todos);

	return todoList;
}

/**
 * Clear all todos for a session
 */
export function clearTodos(sessionId: string): void {
	const todoList = loadTodos(sessionId);
	if (todoList) {
		todoList.todos = [];
		todoList.updatedAt = Date.now();
		saveTodos(todoList);
		emitTodoUpdate(sessionId, 'clear', []);
	}
}

/**
 * Get progress summary for a session's todos
 */
export function getTodoProgress(sessionId: string): {
	total: number;
	completed: number;
	inProgress: number;
	pending: number;
} | null {
	const todoList = loadTodos(sessionId);
	if (!todoList) {
		return null;
	}

	return {
		total: todoList.todos.length,
		completed: todoList.todos.filter((t) => t.status === 'completed').length,
		inProgress: todoList.todos.filter((t) => t.status === 'in_progress').length,
		pending: todoList.todos.filter((t) => t.status === 'pending').length,
	};
}

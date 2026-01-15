/**
 * Session Manager
 *
 * Handles saving and loading agent sessions for the resume functionality.
 * Sessions are stored at ~/.config/agentmaster/sessions/{sessionId}/session.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentSession } from './agent.js';

// ============================================================================
// Constants
// ============================================================================

const SESSIONS_DIR = join(homedir(), '.config', 'agentmaster', 'sessions');
const SESSION_FILE = 'session.json';
const MAX_SESSIONS_PER_AGENT = 20; // Keep last N sessions per agent

// ============================================================================
// Storage Paths
// ============================================================================

function getSessionDir(sessionId: string): string {
	return join(SESSIONS_DIR, sessionId);
}

function getSessionPath(sessionId: string): string {
	return join(getSessionDir(sessionId), SESSION_FILE);
}

function ensureSessionDir(sessionId: string): void {
	const dir = getSessionDir(sessionId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

// ============================================================================
// Session Info (Summary without full message content)
// ============================================================================

export interface SessionInfo {
	id: string;
	agentName: string;
	createdAt: number;
	updatedAt: number;
	messageCount: number;
	/** First user message (truncated) */
	preview: string;
	/** Total tokens used in session */
	totalTokens: number;
	/** Total cost in USD */
	costUSD: number;
}

/**
 * Extract a preview from session messages
 */
function extractPreview(session: AgentSession, maxLength = 80): string {
	// Find first user message
	for (const msg of session.messages) {
		if (msg.role === 'user') {
			const content = typeof msg.content === 'string'
				? msg.content
				: Array.isArray(msg.content)
					? msg.content.find(p => p.type === 'text')?.text || ''
					: '';

			if (content.length > maxLength) {
				return content.slice(0, maxLength - 3) + '...';
			}
			return content;
		}
	}
	return '(empty session)';
}

/**
 * Convert full session to summary info
 */
function sessionToInfo(session: AgentSession): SessionInfo {
	return {
		id: session.id,
		agentName: session.agentName,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
		messageCount: session.messages.length,
		preview: extractPreview(session),
		totalTokens: session.stats.totalTokens,
		costUSD: session.stats.costUSD,
	};
}

// ============================================================================
// Core Operations
// ============================================================================

/**
 * Save a session to disk
 */
export function saveSession(session: AgentSession): void {
	ensureSessionDir(session.id);
	const path = getSessionPath(session.id);
	writeFileSync(path, JSON.stringify(session, null, 2), 'utf-8');

	// Clean up old sessions for this agent
	cleanupOldSessions(session.agentName, MAX_SESSIONS_PER_AGENT);
}

/**
 * Load a session from disk
 */
export function loadSession(sessionId: string): AgentSession | null {
	const path = getSessionPath(sessionId);

	if (!existsSync(path)) {
		return null;
	}

	try {
		const content = readFileSync(path, 'utf-8');
		return JSON.parse(content) as AgentSession;
	} catch {
		return null;
	}
}

/**
 * Delete a session from disk
 */
export function deleteSession(sessionId: string): boolean {
	const dir = getSessionDir(sessionId);

	if (!existsSync(dir)) {
		return false;
	}

	try {
		rmSync(dir, { recursive: true });
		return true;
	} catch {
		return false;
	}
}

/**
 * List all saved sessions, optionally filtered by agent name
 * Returns sessions sorted by updatedAt (newest first)
 */
export function listSessions(agentName?: string): SessionInfo[] {
	if (!existsSync(SESSIONS_DIR)) {
		return [];
	}

	const sessions: SessionInfo[] = [];

	try {
		const sessionDirs = readdirSync(SESSIONS_DIR);

		for (const dir of sessionDirs) {
			const sessionPath = join(SESSIONS_DIR, dir, SESSION_FILE);

			if (existsSync(sessionPath)) {
				try {
					const content = readFileSync(sessionPath, 'utf-8');
					const session = JSON.parse(content) as AgentSession;

					// Filter by agent name if specified
					if (agentName && session.agentName !== agentName) {
						continue;
					}

					sessions.push(sessionToInfo(session));
				} catch {
					// Skip corrupted sessions
				}
			}
		}
	} catch {
		return [];
	}

	// Sort by updatedAt, newest first
	return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Get session info without loading full content
 */
export function getSessionInfo(sessionId: string): SessionInfo | null {
	const session = loadSession(sessionId);
	if (!session) return null;
	return sessionToInfo(session);
}

/**
 * Get all unique agent names that have saved sessions
 */
export function getAgentNames(): string[] {
	const sessions = listSessions();
	const names = new Set(sessions.map(s => s.agentName));
	return Array.from(names).sort();
}

/**
 * Check if a session exists
 */
export function sessionExists(sessionId: string): boolean {
	return existsSync(getSessionPath(sessionId));
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up old sessions for an agent, keeping only the most recent N
 */
function cleanupOldSessions(agentName: string, keepCount: number): void {
	const sessions = listSessions(agentName);

	if (sessions.length <= keepCount) {
		return;
	}

	// Sessions are already sorted newest first, delete oldest
	const toDelete = sessions.slice(keepCount);

	for (const session of toDelete) {
		deleteSession(session.id);
	}
}

/**
 * Get total storage size of all sessions
 */
export function getStorageSize(): { totalBytes: number; sessionCount: number } {
	if (!existsSync(SESSIONS_DIR)) {
		return { totalBytes: 0, sessionCount: 0 };
	}

	let totalBytes = 0;
	let sessionCount = 0;

	try {
		const sessionDirs = readdirSync(SESSIONS_DIR);

		for (const dir of sessionDirs) {
			const sessionPath = join(SESSIONS_DIR, dir, SESSION_FILE);

			if (existsSync(sessionPath)) {
				try {
					const stats = statSync(sessionPath);
					totalBytes += stats.size;
					sessionCount++;
				} catch {
					// Skip inaccessible files
				}
			}
		}
	} catch {
		// Return zeros on error
	}

	return { totalBytes, sessionCount };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a timestamp as a relative time string
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return days === 1 ? '1 day ago' : `${days} days ago`;
	}
	if (hours > 0) {
		return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
	}
	if (minutes > 0) {
		return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
	}
	return 'just now';
}

/**
 * Format a date for display
 */
export function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

import { EventEmitter } from 'node:events';

// ============================================================================
// Event Type Definitions
// ============================================================================

export interface SubAgentStartEvent {
	type: 'subAgentStart';
	processId: string;
	agentName: string;
	parentToolCallId: string;
	task: string;
	model: string;
	timestamp: number;
}

export interface SubAgentToolCallEvent {
	type: 'subAgentToolCall';
	processId: string;
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	status: 'running' | 'complete' | 'error';
	result?: unknown;
	error?: string;
	startTime: number;
	endTime?: number;
}

export interface SubAgentLogEvent {
	type: 'subAgentLog';
	processId: string;
	level: 'info' | 'debug' | 'warn' | 'error';
	message: string;
	timestamp: number;
}

export interface SubAgentFinishEvent {
	type: 'subAgentFinish';
	processId: string;
	agentName: string;
	status: 'success' | 'error';
	result?: string;
	error?: string;
	duration: number;
	toolCallCount: number;
	timestamp: number;
}

export type AgentBusEvent =
	| SubAgentStartEvent
	| SubAgentToolCallEvent
	| SubAgentLogEvent
	| SubAgentFinishEvent;

export type AgentEventType = AgentBusEvent['type'] | 'all';

// ============================================================================
// Typed Event Emitter Interface
// ============================================================================

type EventListener = (event: AgentBusEvent) => void;

export interface AgentEventEmitter {
	emit(event: AgentBusEvent): boolean;
	on(type: AgentEventType, listener: EventListener): this;
	off(type: AgentEventType, listener: EventListener): this;
	removeAllListeners(type?: AgentEventType): this;
}

// ============================================================================
// Implementation (using composition)
// ============================================================================

class AgentEventBus implements AgentEventEmitter {
	private emitter = new EventEmitter();

	emit(event: AgentBusEvent): boolean {
		// Emit on the specific event type channel
		const typeResult = this.emitter.emit(event.type, event);
		// Also emit on 'all' channel for listeners that want all events
		const allResult = this.emitter.emit('all', event);
		return typeResult || allResult;
	}

	on(type: AgentEventType, listener: EventListener): this {
		this.emitter.on(type, listener);
		return this;
	}

	off(type: AgentEventType, listener: EventListener): this {
		this.emitter.off(type, listener);
		return this;
	}

	removeAllListeners(type?: AgentEventType): this {
		this.emitter.removeAllListeners(type);
		return this;
	}
}

// ============================================================================
// Singleton & Helpers
// ============================================================================

// Counter for generating unique process IDs
let processIdCounter = 0;

/**
 * Generates a unique process ID for sub-agent tracking
 * Format: subagent_{timestamp}_{counter}
 */
export function generateProcessId(): string {
	processIdCounter++;
	return `subagent_${Date.now()}_${processIdCounter}`;
}

/**
 * Creates a filter function for events by processId
 * Useful for UI components that only care about specific sub-agents
 */
export function filterByProcess(processId: string): (event: AgentBusEvent) => boolean {
	return (event: AgentBusEvent) => event.processId === processId;
}

/**
 * Factory function for creating a new event bus instance
 * Useful for testing
 */
export function createAgentEventBus(): AgentEventEmitter {
	return new AgentEventBus();
}

/**
 * Singleton event bus instance for the application
 * Use this for production code
 */
export const agentEvents: AgentEventEmitter = createAgentEventBus();

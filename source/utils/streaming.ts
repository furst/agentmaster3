/**
 * Streaming utilities for handling AI responses
 */

import type { ToolCallEvent } from '../core/agent.js';

export interface StreamChunk {
	type: 'text' | 'tool-call-start' | 'tool-call-complete' | 'tool-call-error' | 'done' | 'error';
	content?: string;
	toolCall?: ToolCallEvent;
	error?: Error;
}

/**
 * Creates a debounced stream processor that batches rapid updates
 * Useful for reducing UI re-renders during fast streaming
 */
export function createStreamBuffer(
	onFlush: (content: string) => void,
	intervalMs = 16
): {
	push: (content: string) => void;
	flush: () => void;
	destroy: () => void;
} {
	let buffer = '';
	let timer: ReturnType<typeof setTimeout> | null = null;

	const flush = () => {
		if (buffer) {
			onFlush(buffer);
			buffer = '';
		}
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const push = (content: string) => {
		buffer += content;

		if (!timer) {
			timer = setTimeout(flush, intervalMs);
		}
	};

	const destroy = () => {
		flush();
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return { push, flush, destroy };
}

/**
 * Splits streaming content into complete lines and a remainder
 * Useful for line-by-line processing of streamed text
 */
export function splitLines(
	buffer: string,
	chunk: string
): { lines: string[]; remainder: string } {
	const combined = buffer + chunk;
	const parts = combined.split('\n');
	const remainder = parts.pop() ?? '';
	return { lines: parts, remainder };
}

/**
 * Creates a character-by-character typewriter effect for streaming text
 */
export async function* typewriterEffect(
	text: string,
	charDelayMs = 20
): AsyncGenerator<string> {
	for (const char of text) {
		yield char;
		await new Promise((resolve) => setTimeout(resolve, charDelayMs));
	}
}

/**
 * Accumulator for building up streamed content
 */
export class StreamAccumulator {
	private content = '';
	private toolCalls: ToolCallEvent[] = [];

	appendText(text: string): void {
		this.content += text;
	}

	addToolCall(toolCall: ToolCallEvent): void {
		const existing = this.toolCalls.findIndex(
			(tc) => tc.toolCallId === toolCall.toolCallId
		);
		if (existing >= 0) {
			this.toolCalls[existing] = toolCall;
		} else {
			this.toolCalls.push(toolCall);
		}
	}

	getContent(): string {
		return this.content;
	}

	getToolCalls(): ToolCallEvent[] {
		return [...this.toolCalls];
	}

	getActiveToolCalls(): ToolCallEvent[] {
		return this.toolCalls.filter(
			(tc) => tc.status === 'pending' || tc.status === 'running'
		);
	}

	getCompletedToolCalls(): ToolCallEvent[] {
		return this.toolCalls.filter(
			(tc) => tc.status === 'complete' || tc.status === 'error'
		);
	}

	clear(): void {
		this.content = '';
		this.toolCalls = [];
	}
}

/**
 * Utility to measure streaming performance
 */
export class StreamMetrics {
	private startTime: number | null = null;
	private firstTokenTime: number | null = null;
	private tokenCount = 0;
	private charCount = 0;

	start(): void {
		this.startTime = Date.now();
		this.firstTokenTime = null;
		this.tokenCount = 0;
		this.charCount = 0;
	}

	recordToken(content: string): void {
		if (this.firstTokenTime === null) {
			this.firstTokenTime = Date.now();
		}
		this.tokenCount++;
		this.charCount += content.length;
	}

	getMetrics(): {
		timeToFirstToken: number | null;
		totalTime: number | null;
		tokensPerSecond: number | null;
		charsPerSecond: number | null;
	} {
		if (!this.startTime) {
			return {
				timeToFirstToken: null,
				totalTime: null,
				tokensPerSecond: null,
				charsPerSecond: null,
			};
		}

		const now = Date.now();
		const totalTime = now - this.startTime;
		const timeToFirstToken = this.firstTokenTime
			? this.firstTokenTime - this.startTime
			: null;

		return {
			timeToFirstToken,
			totalTime,
			tokensPerSecond: totalTime > 0 ? (this.tokenCount / totalTime) * 1000 : null,
			charsPerSecond: totalTime > 0 ? (this.charCount / totalTime) * 1000 : null,
		};
	}
}

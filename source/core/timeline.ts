import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAgent, type Agent, type ToolCallEvent } from './agent.js';
import {
	agentEvents,
	type AgentBusEvent,
	type SubAgentStartEvent,
	type SubAgentToolCallEvent,
	type SubAgentFinishEvent,
} from './events.js';

// ============================================================================
// Timeline Types
// ============================================================================

export type TimelineEntryType =
	| 'user-message'    // User input
	| 'text-segment'    // Assistant text (finalized)
	| 'tool-call'       // Tool with status
	| 'sub-agent'       // Sub-agent with nested tool calls
	| 'streaming-text'; // Currently streaming

export interface SubAgentToolCall {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	status: 'running' | 'complete' | 'error';
	result?: unknown;
	error?: string;
	startTime: number;
	endTime?: number;
}

export interface SubAgentData {
	processId: string;
	agentName: string;
	task: string;
	model: string;
	status: 'running' | 'success' | 'error';
	startTime: number;
	endTime?: number;
	toolCalls: SubAgentToolCall[];
	result?: string;
	error?: string;
}

export interface TimelineEntry {
	id: string;
	type: TimelineEntryType;
	timestamp: number;
	content?: string;           // For text entries
	toolCall?: ToolCallEvent;   // For tool entries
	subAgent?: SubAgentData;    // For sub-agent entries
	isStreaming?: boolean;
}

// ============================================================================
// ID Generation
// ============================================================================

let timelineIdCounter = 0;
function generateTimelineId(): string {
	return `tl_${Date.now()}_${++timelineIdCounter}`;
}

// ============================================================================
// useAgentTimeline Hook
// ============================================================================

/**
 * React hook that wraps useAgent and provides a chronological timeline view
 * of the conversation, with text and tool calls interleaved in order.
 *
 * Key design decisions:
 * 1. We maintain our own copy of accumulated text (accumulatedTextRef) because
 *    useAgent clears streamingContent to '' on finish before we can capture it.
 * 2. We track which text has been "finalized" into timeline entries vs still streaming.
 * 3. Tool calls trigger finalization of any pending text before them.
 */
export function useAgentTimeline(agent: Agent) {
	const {
		messages,
		isLoading,
		streamingContent,
		currentToolCalls,
		error,
		stats,
		sendMessage: agentSendMessage,
		cancel,
		reset: agentReset,
	} = useAgent(agent);

	const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

	// Our own accumulator - keeps track of ALL text seen (since useAgent clears streamingContent)
	const accumulatedTextRef = useRef('');
	// How much of accumulatedText has been finalized into timeline entries
	const finalizedPositionRef = useRef(0);
	// Current streaming entry ID
	const currentStreamingIdRef = useRef<string | null>(null);
	// Track which tool calls have been added to timeline
	const processedToolCallIdsRef = useRef<Set<string>>(new Set());
	// Track previous isLoading to detect finish
	const wasLoadingRef = useRef(false);

	// Update our accumulator when streaming content changes
	// streamingContent is cumulative, so we just need to capture the max length we've seen
	useEffect(() => {
		if (streamingContent && streamingContent.length > accumulatedTextRef.current.length) {
			accumulatedTextRef.current = streamingContent;
		}
	}, [streamingContent]);

	// Helper to finalize text segment
	const addTextEntry = useCallback((text: string) => {
		if (!text.trim()) return;

		const entry: TimelineEntry = {
			id: currentStreamingIdRef.current || generateTimelineId(),
			type: 'text-segment',
			timestamp: Date.now(),
			content: text,
		};
		setTimeline(prev => [...prev, entry]);
		currentStreamingIdRef.current = null;
	}, []);

	// Watch for new tool calls - finalize pending text before adding tool entry
	useEffect(() => {
		const newToolCalls = currentToolCalls.filter(
			tc => !processedToolCallIdsRef.current.has(tc.toolCallId)
		);

		if (newToolCalls.length === 0) return;

		// Finalize any accumulated text before the first new tool call
		const pendingText = accumulatedTextRef.current.slice(finalizedPositionRef.current);
		if (pendingText.trim()) {
			addTextEntry(pendingText);
			finalizedPositionRef.current = accumulatedTextRef.current.length;
		}

		// Add tool call entries
		for (const tc of newToolCalls) {
			const toolEntry: TimelineEntry = {
				id: generateTimelineId(),
				type: 'tool-call',
				timestamp: tc.startTime,
				toolCall: tc,
			};
			setTimeline(prev => [...prev, toolEntry]);
			processedToolCallIdsRef.current.add(tc.toolCallId);
		}
	}, [currentToolCalls, addTextEntry]);

	// Enrich timeline with current tool call states (computed on every render)
	// This ensures tool call status changes are reflected immediately without useEffect delay
	const enrichedTimeline = useMemo(() => {
		return timeline.map(entry => {
			if (entry.type !== 'tool-call' || !entry.toolCall) return entry;

			const currentToolCall = currentToolCalls.find(
				tc => tc.toolCallId === entry.toolCall!.toolCallId
			);

			// If we have a more recent version from currentToolCalls, use it
			if (currentToolCall && (
				currentToolCall.status !== entry.toolCall.status ||
				currentToolCall.endTime !== entry.toolCall.endTime
			)) {
				return { ...entry, toolCall: currentToolCall };
			}
			return entry;
		});
	}, [timeline, currentToolCalls]);

	// Detect when loading finishes and finalize remaining text + force-complete tool calls
	useEffect(() => {
		const justFinished = wasLoadingRef.current && !isLoading;
		wasLoadingRef.current = isLoading;

		if (justFinished) {
			// Finalize any remaining text
			const pendingText = accumulatedTextRef.current.slice(finalizedPositionRef.current);
			if (pendingText.trim()) {
				addTextEntry(pendingText);
				finalizedPositionRef.current = accumulatedTextRef.current.length;
			}

			// Force any tool calls still marked as 'running' to 'complete'
			// This ensures no spinners keep animating after finish
			setTimeline(prev => {
				let changed = false;
				const updated = prev.map(entry => {
					if (entry.type === 'tool-call' && entry.toolCall?.status === 'running') {
						changed = true;
						return {
							...entry,
							toolCall: {
								...entry.toolCall,
								status: 'complete' as const,
								endTime: Date.now(),
							},
						};
					}
					return entry;
				});
				return changed ? updated : prev;
			});
		}
	}, [isLoading, addTextEntry]);

	// Subscribe to sub-agent events and integrate them into the timeline
	useEffect(() => {
		const handleSubAgentStart = (e: AgentBusEvent) => {
			if (e.type !== 'subAgentStart') return;
			const event = e as SubAgentStartEvent;

			// Finalize any pending text before the sub-agent entry
			const pendingText = accumulatedTextRef.current.slice(finalizedPositionRef.current);
			if (pendingText.trim()) {
				addTextEntry(pendingText);
				finalizedPositionRef.current = accumulatedTextRef.current.length;
			}

			// Add sub-agent entry to timeline
			const subAgentEntry: TimelineEntry = {
				id: `sa_${event.processId}`,
				type: 'sub-agent',
				timestamp: event.timestamp,
				subAgent: {
					processId: event.processId,
					agentName: event.agentName,
					task: event.task,
					model: event.model,
					status: 'running',
					startTime: event.timestamp,
					toolCalls: [],
				},
			};
			setTimeline(prev => [...prev, subAgentEntry]);
		};

		const handleSubAgentToolCall = (e: AgentBusEvent) => {
			if (e.type !== 'subAgentToolCall') return;
			const event = e as SubAgentToolCallEvent;

			setTimeline(prev => {
				return prev.map(entry => {
					if (entry.type !== 'sub-agent' || entry.subAgent?.processId !== event.processId) {
						return entry;
					}

					const existingToolCall = entry.subAgent.toolCalls.find(
						tc => tc.toolCallId === event.toolCallId
					);

					let updatedToolCalls: SubAgentToolCall[];
					if (existingToolCall) {
						// Update existing tool call
						updatedToolCalls = entry.subAgent.toolCalls.map(tc =>
							tc.toolCallId === event.toolCallId
								? {
									...tc,
									status: event.status,
									result: event.result,
									error: event.error,
									endTime: event.endTime,
								}
								: tc
						);
					} else {
						// Add new tool call
						updatedToolCalls = [
							...entry.subAgent.toolCalls,
							{
								toolCallId: event.toolCallId,
								toolName: event.toolName,
								args: event.args,
								status: event.status,
								result: event.result,
								error: event.error,
								startTime: event.startTime,
								endTime: event.endTime,
							},
						];
					}

					return {
						...entry,
						subAgent: {
							...entry.subAgent,
							toolCalls: updatedToolCalls,
						},
					};
				});
			});
		};

		const handleSubAgentFinish = (e: AgentBusEvent) => {
			if (e.type !== 'subAgentFinish') return;
			const event = e as SubAgentFinishEvent;

			setTimeline(prev => {
				return prev.map(entry => {
					if (entry.type !== 'sub-agent' || entry.subAgent?.processId !== event.processId) {
						return entry;
					}

					return {
						...entry,
						subAgent: {
							...entry.subAgent,
							status: event.status,
							endTime: event.timestamp,
							result: event.result,
							error: event.error,
						},
					};
				});
			});
		};

		agentEvents.on('subAgentStart', handleSubAgentStart);
		agentEvents.on('subAgentToolCall', handleSubAgentToolCall);
		agentEvents.on('subAgentFinish', handleSubAgentFinish);

		return () => {
			agentEvents.off('subAgentStart', handleSubAgentStart);
			agentEvents.off('subAgentToolCall', handleSubAgentToolCall);
			agentEvents.off('subAgentFinish', handleSubAgentFinish);
		};
	}, [addTextEntry]);

	// Compute streaming entry for display (non-finalized portion)
	const streamingEntry = useMemo((): TimelineEntry | null => {
		if (!isLoading) return null;

		const pendingText = accumulatedTextRef.current.slice(finalizedPositionRef.current);
		if (!pendingText) return null;

		if (!currentStreamingIdRef.current) {
			currentStreamingIdRef.current = generateTimelineId();
		}

		return {
			id: currentStreamingIdRef.current,
			type: 'streaming-text',
			timestamp: Date.now(),
			content: pendingText,
			isStreaming: true,
		};
	// Include streamingContent in deps to trigger re-computation when it changes
	}, [isLoading, streamingContent]);

	// Add user message to timeline without sending to agent
	const addUserMessage = useCallback((content: string) => {
		if (!content.trim()) return;

		const userEntry: TimelineEntry = {
			id: generateTimelineId(),
			type: 'user-message',
			timestamp: Date.now(),
			content,
		};
		setTimeline(prev => [...prev, userEntry]);
	}, []);

	// Enhanced sendMessage that adds user message to timeline
	const sendMessage = useCallback(async (content: string, options?: { skipUserMessage?: boolean }) => {
		if (!content.trim()) return;

		// Add user message to timeline (unless skipped for internal messages)
		if (!options?.skipUserMessage) {
			const userEntry: TimelineEntry = {
				id: generateTimelineId(),
				type: 'user-message',
				timestamp: Date.now(),
				content,
			};
			setTimeline(prev => [...prev, userEntry]);
		}

		// Reset accumulator state for new message
		accumulatedTextRef.current = '';
		finalizedPositionRef.current = 0;
		currentStreamingIdRef.current = null;
		processedToolCallIdsRef.current.clear();

		// Send to agent
		await agentSendMessage(content);
	}, [agentSendMessage]);

	// Enhanced reset that clears timeline
	const reset = useCallback(() => {
		agentReset();
		setTimeline([]);
		accumulatedTextRef.current = '';
		finalizedPositionRef.current = 0;
		currentStreamingIdRef.current = null;
		processedToolCallIdsRef.current.clear();
	}, [agentReset]);

	return {
		// Timeline state (enriched with latest tool call status)
		timeline: enrichedTimeline,
		streamingEntry,

		// Original state (for backwards compatibility)
		messages,
		isLoading,
		currentToolCalls,
		error,
		stats,

		// Actions
		sendMessage,
		addUserMessage,
		cancel,
		reset,
	};
}

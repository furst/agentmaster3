/**
 * @conductor/core - Agent framework for building AI CLI applications
 */

// Re-export everything from core
export * from './core/index.js';

// Re-export components (with explicit names to avoid conflicts with core)
export {
	Spinner,
	ThinkingIndicator,
	ErrorDisplay,
	ApiErrorDisplay,
	Message as MessageComponent,
	MessageList,
	SystemMessage,
	Markdown,
	ToolCall,
	ToolCallList,
	Timeline,
	InlineTimeline,
	AgentShell,
	MinimalAgentShell,
} from './components/index.js';
export type {
	SpinnerProps,
	ThinkingIndicatorProps,
	ErrorDisplayProps,
	ApiErrorDisplayProps,
	MessageProps,
	MessageListProps,
	SystemMessageProps,
	MarkdownProps,
	ToolCallProps,
	ToolCallListProps,
	TimelineProps,
	TimelineEvent,
	TimelineEventType,
	InlineTimelineProps,
	AgentShellProps,
	MinimalAgentShellProps,
} from './components/index.js';

// Re-export framework tools
export * from './tools/index.js';

// Re-export utilities
export {
	truncate,
	formatDuration,
	formatJson,
	wrapText,
	stripAnsi,
	formatBytes,
	formatRelativeTime as formatRelativeTimeUtil,
	indent,
	box,
} from './utils/format.js';

export { parseModelDisplay } from './utils/model.js';
export type { ModelDisplayInfo } from './utils/model.js';

export {
	createStreamBuffer,
	splitLines,
	typewriterEffect,
	StreamAccumulator,
	StreamMetrics,
} from './utils/streaming.js';
export type { StreamChunk } from './utils/streaming.js';

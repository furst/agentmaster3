/**
 * Text formatting utilities for CLI display
 */

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 3) + '...';
}

/**
 * Formats a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	if (ms < 60000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	const minutes = Math.floor(ms / 60000);
	const seconds = ((ms % 60000) / 1000).toFixed(0);
	return `${minutes}m ${seconds}s`;
}

/**
 * Formats a JSON object for display
 */
export function formatJson(obj: unknown): string {
	try {
		return JSON.stringify(
			obj,
			(_key, value: unknown) => {
				if (typeof value === 'string' && value.length > 100) {
					return truncate(value, 100);
				}
				return value;
			},
			2
		);
	} catch {
		return String(obj);
	}
}

/**
 * Wraps text to a specified width
 */
export function wrapText(text: string, width: number): string {
	const words = text.split(' ');
	const lines: string[] = [];
	let currentLine = '';

	for (const word of words) {
		if (currentLine.length + word.length + 1 <= width) {
			currentLine += (currentLine ? ' ' : '') + word;
		} else {
			if (currentLine) lines.push(currentLine);
			currentLine = word;
		}
	}

	if (currentLine) lines.push(currentLine);
	return lines.join('\n');
}

/**
 * Strips ANSI escape codes from a string
 */
export function stripAnsi(text: string): string {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Formats bytes to a human-readable string
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const k = 1024;
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Formats a relative time string
 */
export function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	if (diff < 1000) return 'just now';
	if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	return `${Math.floor(diff / 86400000)}d ago`;
}

/**
 * Indents each line of text by a specified number of spaces
 */
export function indent(text: string, spaces = 2): string {
	const prefix = ' '.repeat(spaces);
	return text
		.split('\n')
		.map((line) => prefix + line)
		.join('\n');
}

/**
 * Creates a simple box around text
 */
export function box(text: string, padding = 1): string {
	const lines = text.split('\n');
	const maxWidth = Math.max(...lines.map((l) => stripAnsi(l).length));
	const paddingStr = ' '.repeat(padding);

	const top = '┌' + '─'.repeat(maxWidth + padding * 2) + '┐';
	const bottom = '└' + '─'.repeat(maxWidth + padding * 2) + '┘';
	const emptyLine = '│' + ' '.repeat(maxWidth + padding * 2) + '│';

	const contentLines = lines.map((line) => {
		const lineLength = stripAnsi(line).length;
		const rightPadding = ' '.repeat(maxWidth - lineLength);
		return '│' + paddingStr + line + rightPadding + paddingStr + '│';
	});

	const paddingLines = Array(padding).fill(emptyLine);

	return [top, ...paddingLines, ...contentLines, ...paddingLines, bottom].join('\n');
}

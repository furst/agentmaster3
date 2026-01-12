import React from 'react';
import { Box, Text } from 'ink';

export interface MarkdownProps {
	/** Markdown content to render */
	content: string;
	/** Base text color */
	color?: string;
}

/**
 * Renders markdown-formatted text in Ink
 * Supports: headers, bold, italic, lists, horizontal rules
 */
export function Markdown({ content, color = 'white' }: MarkdownProps) {
	const lines = content.split('\n');
	const elements: React.ReactNode[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		const trimmed = line.trim();
		const key = `line-${i}`;

		// Empty line
		if (!trimmed) {
			elements.push(<Text key={key}>{' '}</Text>);
			continue;
		}

		// Horizontal rule
		if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
			elements.push(
				<Box key={key} marginY={1}>
					<Text color="gray">{'─'.repeat(40)}</Text>
				</Box>
			);
			continue;
		}

		// Headers
		if (trimmed.startsWith('### ')) {
			elements.push(
				<Box key={key} marginTop={1}>
					<Text color={color} bold>
						{parseInline(trimmed.slice(4))}
					</Text>
				</Box>
			);
			continue;
		}
		if (trimmed.startsWith('## ')) {
			elements.push(
				<Box key={key} marginTop={1}>
					<Text color={color} bold underline>
						{parseInline(trimmed.slice(3))}
					</Text>
				</Box>
			);
			continue;
		}
		if (trimmed.startsWith('# ')) {
			elements.push(
				<Box key={key} marginTop={1} marginBottom={1}>
					<Text color={color} bold>
						{'━━ '}{parseInline(trimmed.slice(2))}{' ━━'}
					</Text>
				</Box>
			);
			continue;
		}

		// Bullet lists (- or *)
		if (/^[-*]\s+/.test(trimmed)) {
			const content = trimmed.replace(/^[-*]\s+/, '');
			elements.push(
				<Box key={key}>
					<Text color="gray">{'  • '}</Text>
					<Text color={color} wrap="wrap">{parseInline(content)}</Text>
				</Box>
			);
			continue;
		}

		// Numbered lists
		const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
		if (numberedMatch && numberedMatch[2]) {
			elements.push(
				<Box key={key}>
					<Text color="gray">{'  '}{numberedMatch[1]}. </Text>
					<Text color={color} wrap="wrap">{parseInline(numberedMatch[2])}</Text>
				</Box>
			);
			continue;
		}

		// Regular text
		elements.push(
			<Box key={key}>
				<Text color={color} wrap="wrap">{parseInline(trimmed)}</Text>
			</Box>
		);
	}

	return <Box flexDirection="column">{elements}</Box>;
}

/**
 * Parse inline formatting (**bold**, *italic*)
 */
function parseInline(text: string): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	let remaining = text;
	let keyIndex = 0;

	while (remaining.length > 0) {
		// Bold **text**
		const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
		if (boldMatch && boldMatch.index !== undefined) {
			if (boldMatch.index > 0) {
				parts.push(<Text key={`t-${keyIndex++}`}>{remaining.slice(0, boldMatch.index)}</Text>);
			}
			parts.push(
				<Text key={`b-${keyIndex++}`} bold>
					{boldMatch[1]}
				</Text>
			);
			remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
			continue;
		}

		// Italic *text* (but not bullet points)
		const italicMatch = remaining.match(/(?<!\S)\*([^*\n]+)\*(?!\S)/);
		if (italicMatch && italicMatch.index !== undefined) {
			if (italicMatch.index > 0) {
				parts.push(<Text key={`t-${keyIndex++}`}>{remaining.slice(0, italicMatch.index)}</Text>);
			}
			parts.push(
				<Text key={`i-${keyIndex++}`} italic>
					{italicMatch[1]}
				</Text>
			);
			remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
			continue;
		}

		// No more matches
		parts.push(<Text key={`t-${keyIndex++}`}>{remaining}</Text>);
		break;
	}

	return parts;
}

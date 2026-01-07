import React from 'react';
import { Box, Text } from 'ink';

/**
 * Content card types with associated styling
 */
export type ContentCardType =
	| 'recipe'
	| 'news'
	| 'finance'
	| 'summary'
	| 'list'
	| 'info'
	| 'warning'
	| 'success';

interface CardTheme {
	borderColor: string;
	titleColor: string;
	icon: string;
	borderStyle: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
}

const themes: Record<ContentCardType, CardTheme> = {
	recipe: {
		borderColor: 'yellow',
		titleColor: 'yellow',
		icon: '🍳',
		borderStyle: 'round',
	},
	news: {
		borderColor: 'blue',
		titleColor: 'blue',
		icon: '📰',
		borderStyle: 'round',
	},
	finance: {
		borderColor: 'green',
		titleColor: 'green',
		icon: '💰',
		borderStyle: 'double',
	},
	summary: {
		borderColor: 'cyan',
		titleColor: 'cyan',
		icon: '📋',
		borderStyle: 'round',
	},
	list: {
		borderColor: 'magenta',
		titleColor: 'magenta',
		icon: '📝',
		borderStyle: 'single',
	},
	info: {
		borderColor: 'blue',
		titleColor: 'blue',
		icon: 'ℹ',
		borderStyle: 'single',
	},
	warning: {
		borderColor: 'yellow',
		titleColor: 'yellow',
		icon: '⚠',
		borderStyle: 'bold',
	},
	success: {
		borderColor: 'green',
		titleColor: 'green',
		icon: '✓',
		borderStyle: 'single',
	},
};

export interface ContentCardProps {
	/** Card type determines styling */
	type: ContentCardType;
	/** Optional title displayed at top */
	title?: string;
	/** Content to display */
	content: string;
	/** Show icon next to title */
	showIcon?: boolean;
	/** Custom border color override */
	borderColor?: string;
}

/**
 * Parses simple markdown-like formatting in content
 * Supports: **bold**, headers (#, ##, ###), lists (- item), numbered lists (1. item)
 */
function parseContent(content: string): React.ReactNode[] {
	const lines = content.split('\n');
	const elements: React.ReactNode[] = [];

	lines.forEach((line, index) => {
		const trimmed = line.trim();
		const key = `line-${index}`;

		// Empty line
		if (!trimmed) {
			elements.push(<Text key={key}>{'\n'}</Text>);
			return;
		}

		// Headers
		if (trimmed.startsWith('### ')) {
			elements.push(
				<Box key={key} marginTop={index > 0 ? 1 : 0}>
					<Text color="white" bold>
						{trimmed.slice(4)}
					</Text>
				</Box>
			);
			return;
		}
		if (trimmed.startsWith('## ')) {
			elements.push(
				<Box key={key} marginTop={index > 0 ? 1 : 0}>
					<Text color="white" bold underline>
						{trimmed.slice(3)}
					</Text>
				</Box>
			);
			return;
		}
		if (trimmed.startsWith('# ')) {
			elements.push(
				<Box key={key} marginTop={index > 0 ? 1 : 0} marginBottom={1}>
					<Text color="white" bold>
						{'━'.repeat(2)} {trimmed.slice(2)} {'━'.repeat(2)}
					</Text>
				</Box>
			);
			return;
		}

		// Bullet lists
		if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
			elements.push(
				<Box key={key}>
					<Text color="gray">  • </Text>
					<Text wrap="wrap">{parseInlineFormatting(trimmed.slice(2))}</Text>
				</Box>
			);
			return;
		}

		// Numbered lists
		const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
		if (numberedMatch && numberedMatch[2]) {
			elements.push(
				<Box key={key}>
					<Text color="gray">  {numberedMatch[1]}. </Text>
					<Text wrap="wrap">{parseInlineFormatting(numberedMatch[2])}</Text>
				</Box>
			);
			return;
		}

		// Key-value pairs (for recipes, finance, etc.)
		const kvMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
		if (kvMatch && kvMatch[1] && kvMatch[2] && kvMatch[1].length < 30 && !trimmed.includes('http')) {
			elements.push(
				<Box key={key}>
					<Text color="cyan" bold>{kvMatch[1]}: </Text>
					<Text wrap="wrap">{parseInlineFormatting(kvMatch[2])}</Text>
				</Box>
			);
			return;
		}

		// Regular text with inline formatting
		elements.push(
			<Box key={key}>
				<Text wrap="wrap">{parseInlineFormatting(trimmed)}</Text>
			</Box>
		);
	});

	return elements;
}

/**
 * Parse inline formatting (**bold**, *italic*)
 */
function parseInlineFormatting(text: string): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	let remaining = text;
	let keyIndex = 0;

	while (remaining.length > 0) {
		// Bold **text**
		const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
		if (boldMatch && boldMatch.index !== undefined) {
			if (boldMatch.index > 0) {
				parts.push(<Text key={`text-${keyIndex++}`}>{remaining.slice(0, boldMatch.index)}</Text>);
			}
			parts.push(
				<Text key={`bold-${keyIndex++}`} bold>
					{boldMatch[1]}
				</Text>
			);
			remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
			continue;
		}

		// Italic *text*
		const italicMatch = remaining.match(/\*([^*]+)\*/);
		if (italicMatch && italicMatch.index !== undefined) {
			if (italicMatch.index > 0) {
				parts.push(<Text key={`text-${keyIndex++}`}>{remaining.slice(0, italicMatch.index)}</Text>);
			}
			parts.push(
				<Text key={`italic-${keyIndex++}`} italic>
					{italicMatch[1]}
				</Text>
			);
			remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
			continue;
		}

		// No more matches, add remaining text
		parts.push(<Text key={`text-${keyIndex++}`}>{remaining}</Text>);
		break;
	}

	return parts;
}

/**
 * Highlighted content card for presenting important information
 *
 * Supports different themes (recipe, news, finance, etc.) and
 * basic markdown-like formatting for structure.
 */
export function ContentCard({
	type,
	title,
	content,
	showIcon = true,
	borderColor: customBorderColor,
}: ContentCardProps) {
	const theme = themes[type];
	const borderColor = customBorderColor ?? theme.borderColor;

	return (
		<Box
			flexDirection="column"
			borderStyle={theme.borderStyle}
			borderColor={borderColor}
			paddingX={2}
			paddingY={1}
			marginY={1}
		>
			{title && (
				<Box marginBottom={1}>
					{showIcon && <Text>{theme.icon} </Text>}
					<Text color={theme.titleColor} bold>
						{title}
					</Text>
				</Box>
			)}
			<Box flexDirection="column">
				{parseContent(content)}
			</Box>
		</Box>
	);
}

/**
 * Compact divider for separating sections within cards
 */
export function CardDivider({ color = 'gray' }: { color?: string }) {
	return (
		<Box marginY={1}>
			<Text color={color} dimColor>
				{'─'.repeat(40)}
			</Text>
		</Box>
	);
}

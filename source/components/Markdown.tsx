import React from 'react';
import { Box, Text } from 'ink';

export interface MarkdownProps {
	/** Markdown content to render */
	content: string;
	/** Base text color */
	color?: string;
}

/**
 * Check if a line is a table row (starts and ends with |)
 */
function isTableRow(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith('|') && trimmed.endsWith('|');
}

/**
 * Check if a line is a table separator (| :--- | --- | ---: |)
 */
function isTableSeparator(line: string): boolean {
	const trimmed = line.trim();
	if (!isTableRow(line)) return false;
	// Must contain only |, -, :, and spaces
	return /^\|[\s|:\-]+\|$/.test(trimmed);
}

/**
 * Parse table cells from a row
 */
function parseTableCells(line: string): string[] {
	return line
		.trim()
		.slice(1, -1) // Remove leading and trailing |
		.split('|')
		.map(cell => cell.trim());
}

/**
 * Parse alignment from separator row
 */
function parseTableAlignment(separator: string): ('left' | 'center' | 'right')[] {
	return parseTableCells(separator).map(cell => {
		const hasLeftColon = cell.startsWith(':');
		const hasRightColon = cell.endsWith(':');
		if (hasLeftColon && hasRightColon) return 'center';
		if (hasRightColon) return 'right';
		return 'left';
	});
}

/**
 * Pad text according to alignment
 */
function padCell(text: string, width: number, align: 'left' | 'center' | 'right'): string {
	if (text.length >= width) return text;
	const padding = width - text.length;
	switch (align) {
		case 'right':
			return ' '.repeat(padding) + text;
		case 'center': {
			const leftPad = Math.floor(padding / 2);
			const rightPad = padding - leftPad;
			return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
		}
		default:
			return text + ' '.repeat(padding);
	}
}

interface TableData {
	headers: string[];
	alignments: ('left' | 'center' | 'right')[];
	rows: string[][];
	columnWidths: number[];
}

/**
 * Parse a complete table from lines
 */
function parseTable(lines: string[], startIndex: number): { table: TableData; endIndex: number } | null {
	if (startIndex >= lines.length) return null;

	const headerLine = lines[startIndex];
	if (!headerLine || !isTableRow(headerLine)) return null;

	const separatorLine = lines[startIndex + 1];
	if (!separatorLine || !isTableSeparator(separatorLine)) return null;

	const headers = parseTableCells(headerLine);
	const alignments = parseTableAlignment(separatorLine);
	const rows: string[][] = [];

	let endIndex = startIndex + 2;
	while (endIndex < lines.length) {
		const line = lines[endIndex];
		if (!line || !isTableRow(line)) break;
		rows.push(parseTableCells(line));
		endIndex++;
	}

	// Calculate column widths
	const columnWidths = headers.map((h, i) => {
		const headerWidth = h.length;
		const maxRowWidth = rows.reduce((max, row) => Math.max(max, (row[i] || '').length), 0);
		return Math.max(headerWidth, maxRowWidth);
	});

	return {
		table: { headers, alignments, rows, columnWidths },
		endIndex: endIndex - 1, // Return last table line index
	};
}

/**
 * Render a table
 */
function renderTable(table: TableData, keyPrefix: string, color: string): React.ReactNode {
	const { headers, alignments, rows, columnWidths } = table;

	// Render a row of cells
	const renderRow = (cells: string[], isHeader: boolean, key: string) => (
		<Box key={key}>
			<Text color="gray">│</Text>
			{cells.map((cell, i) => {
				const width = columnWidths[i] || cell.length;
				const align = alignments[i] || 'left';
				const paddedCell = padCell(cell, width, align);
				return (
					<React.Fragment key={i}>
						<Text color={isHeader ? 'cyan' : color} bold={isHeader}>
							{' '}{paddedCell}{' '}
						</Text>
						<Text color="gray">│</Text>
					</React.Fragment>
				);
			})}
		</Box>
	);

	// Build separator line
	const separatorLine = columnWidths.map(w => '─'.repeat(w + 2)).join('┼');

	return (
		<Box flexDirection="column" key={keyPrefix} marginY={1}>
			{/* Top border */}
			<Box>
				<Text color="gray">┌{columnWidths.map(w => '─'.repeat(w + 2)).join('┬')}┐</Text>
			</Box>
			{/* Header row */}
			{renderRow(headers, true, `${keyPrefix}-header`)}
			{/* Header separator */}
			<Box>
				<Text color="gray">├{separatorLine}┤</Text>
			</Box>
			{/* Data rows */}
			{rows.map((row, i) => renderRow(row, false, `${keyPrefix}-row-${i}`))}
			{/* Bottom border */}
			<Box>
				<Text color="gray">└{columnWidths.map(w => '─'.repeat(w + 2)).join('┴')}┘</Text>
			</Box>
		</Box>
	);
}

/**
 * Parse a fenced code block
 */
function parseCodeBlock(lines: string[], startIndex: number): { code: string; language: string; endIndex: number } | null {
	const startLine = lines[startIndex];
	if (!startLine) return null;

	const openMatch = startLine.trim().match(/^```(\w*)$/);
	if (!openMatch) return null;

	const language = openMatch[1] || '';
	const codeLines: string[] = [];

	let endIndex = startIndex + 1;
	while (endIndex < lines.length) {
		const line = lines[endIndex];
		if (line?.trim() === '```') {
			return {
				code: codeLines.join('\n'),
				language,
				endIndex,
			};
		}
		codeLines.push(line ?? '');
		endIndex++;
	}

	// No closing ``` found, not a valid code block
	return null;
}

/**
 * Render a code block
 */
function renderCodeBlock(code: string, language: string, keyPrefix: string): React.ReactNode {
	const codeLines = code.split('\n');

	return (
		<Box flexDirection="column" key={keyPrefix} marginY={1}>
			{/* Header with language */}
			<Box>
				<Text color="gray">{'┌─'}</Text>
				{language && <Text color="cyan">{` ${language} `}</Text>}
				<Text color="gray">{'─'.repeat(Math.max(0, 40 - (language ? language.length + 3 : 0)))}</Text>
			</Box>
			{/* Code lines */}
			{codeLines.map((line, i) => (
				<Box key={`${keyPrefix}-line-${i}`}>
					<Text color="gray">{'│ '}</Text>
					<Text color="yellow">{line}</Text>
				</Box>
			))}
			{/* Footer */}
			<Box>
				<Text color="gray">{'└' + '─'.repeat(42)}</Text>
			</Box>
		</Box>
	);
}

/**
 * Renders markdown-formatted text in Ink
 * Supports: headers, bold, italic, code, lists, horizontal rules, tables
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

		// Check for fenced code block
		if (trimmed.startsWith('```')) {
			const result = parseCodeBlock(lines, i);
			if (result) {
				elements.push(renderCodeBlock(result.code, result.language, key));
				i = result.endIndex; // Skip processed lines
				continue;
			}
		}

		// Check for table
		if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1] || '')) {
			const result = parseTable(lines, i);
			if (result) {
				elements.push(renderTable(result.table, key, color));
				i = result.endIndex; // Skip processed lines
				continue;
			}
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
 * Parse inline formatting (**bold**, *italic*, `code`)
 */
function parseInline(text: string): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	let remaining = text;
	let keyIndex = 0;

	while (remaining.length > 0) {
		// Find the earliest match among all patterns
		const patterns: Array<{
			regex: RegExp;
			type: 'bold' | 'italic' | 'code';
		}> = [
			{ regex: /\*\*([^*]+)\*\*/, type: 'bold' },
			{ regex: /`([^`]+)`/, type: 'code' },
			{ regex: /(?<!\S)\*([^*\n]+)\*(?!\S)/, type: 'italic' },
		];

		let earliestMatch: { match: RegExpMatchArray; type: string } | null = null;
		let earliestIndex = Infinity;

		for (const { regex, type } of patterns) {
			const match = remaining.match(regex);
			if (match && match.index !== undefined && match.index < earliestIndex) {
				earliestIndex = match.index;
				earliestMatch = { match, type };
			}
		}

		if (earliestMatch && earliestMatch.match.index !== undefined) {
			const { match, type } = earliestMatch;
			const matchIndex = match.index!; // We've already checked it's defined

			// Add text before the match
			if (matchIndex > 0) {
				parts.push(<Text key={`t-${keyIndex++}`}>{remaining.slice(0, matchIndex)}</Text>);
			}

			// Add the formatted text
			switch (type) {
				case 'bold':
					parts.push(
						<Text key={`b-${keyIndex++}`} bold>
							{match[1]}
						</Text>
					);
					break;
				case 'code':
					parts.push(
						<Text key={`c-${keyIndex++}`} color="yellow">
							{match[1]}
						</Text>
					);
					break;
				case 'italic':
					parts.push(
						<Text key={`i-${keyIndex++}`} italic>
							{match[1]}
						</Text>
					);
					break;
			}

			remaining = remaining.slice(matchIndex + match[0].length);
			continue;
		}

		// No more matches
		parts.push(<Text key={`t-${keyIndex++}`}>{remaining}</Text>);
		break;
	}

	return parts;
}

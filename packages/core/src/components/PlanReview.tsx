import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { Plan } from '../core/session-plan.js';

// ============================================================================
// Types
// ============================================================================

export interface PlanReviewProps {
	plan: Plan;
	onApprove: () => void;
	onEdit: (feedback: string) => void;
	onCancel: () => void;
	isProcessing?: boolean;
}

type ReviewMode = 'review' | 'edit';

// ============================================================================
// Inline Markdown Parser
// ============================================================================

/**
 * Parse inline markdown formatting (**bold**, *italic*, `code`)
 */
function parseInlineMarkdown(text: string): React.ReactNode[] {
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

		// Inline code `text`
		const codeMatch = remaining.match(/`([^`]+)`/);
		if (codeMatch && codeMatch.index !== undefined) {
			if (codeMatch.index > 0) {
				parts.push(<Text key={`t-${keyIndex++}`}>{remaining.slice(0, codeMatch.index)}</Text>);
			}
			parts.push(
				<Text key={`c-${keyIndex++}`} color="cyan">
					{codeMatch[1]}
				</Text>
			);
			remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
			continue;
		}

		// Italic *text* (but not at word boundaries that look like bullets)
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

// ============================================================================
// Main Component
// ============================================================================

export function PlanReview({
	plan,
	onApprove,
	onEdit,
	onCancel,
	isProcessing = false,
}: PlanReviewProps) {
	const [mode, setMode] = useState<ReviewMode>('review');
	const [selectedOption, setSelectedOption] = useState(0);
	const [editKey, setEditKey] = useState(0);

	const options = [
		{ key: 'approve', label: 'Approve & Execute', color: 'green' },
		{ key: 'edit', label: 'Suggest Changes', color: 'yellow' },
		{ key: 'cancel', label: 'Cancel', color: 'red' },
	];

	// Handle keyboard input for review mode
	useInput(
		(input, key) => {
			if (isProcessing || mode !== 'review') return;

			if (key.upArrow) {
				setSelectedOption((prev) => (prev > 0 ? prev - 1 : options.length - 1));
			} else if (key.downArrow) {
				setSelectedOption((prev) => (prev < options.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				const selected = options[selectedOption];
				if (selected?.key === 'approve') {
					onApprove();
				} else if (selected?.key === 'edit') {
					setMode('edit');
				} else if (selected?.key === 'cancel') {
					onCancel();
				}
			} else if (input === 'a' || input === 'A') {
				onApprove();
			} else if (input === 'e' || input === 'E') {
				setMode('edit');
			} else if (input === 'c' || input === 'C') {
				onCancel();
			}
		},
		{ isActive: mode === 'review' && !isProcessing }
	);

	// Handle edit submission
	const handleEditSubmit = (value: string) => {
		if (value.trim()) {
			onEdit(value.trim());
			setEditKey((k) => k + 1);
			setMode('review');
		}
	};

	// Handle escape from edit mode
	useInput(
		(_input, key) => {
			if (key.escape) {
				setMode('review');
				setEditKey((k) => k + 1);
			}
		},
		{ isActive: mode === 'edit' }
	);

	return (
		<Box flexDirection="column" marginTop={1}>
			{/* Header - markdown style */}
			<Box>
				<Text color="blue">● </Text>
				<Text bold>Plan Review</Text>
				{isProcessing && (
					<Text color="gray" dimColor>
						{' '}(processing...)
					</Text>
				)}
			</Box>

			{/* Content - indented like markdown */}
			<Box flexDirection="column" marginLeft={2}>
				{/* Objective */}
				<Box marginTop={1}>
					<Text bold>Objective: </Text>
					<Text wrap="wrap">{parseInlineMarkdown(plan.objective)}</Text>
				</Box>

				{/* Steps */}
				<Box flexDirection="column" marginTop={1}>
					<Text bold>Steps:</Text>
					{plan.steps.map((step, index) => (
						<Box key={step.id} marginLeft={1}>
							<Text color="gray">{index + 1}. </Text>
							<Text wrap="wrap">{parseInlineMarkdown(step.description)}</Text>
						</Box>
					))}
				</Box>

				{/* Review Mode - Options */}
				{mode === 'review' && !isProcessing && (
					<Box flexDirection="column" marginTop={1}>
						<Text color="gray" dimColor>
							↑↓ navigate, Enter select, or press A/E/C:
						</Text>
						<Box marginTop={1}>
							{options.map((option, index) => (
								<Box key={option.key} marginRight={2}>
									<Text color={selectedOption === index ? option.color : 'gray'}>
										{selectedOption === index ? '▸' : ' '}
									</Text>
									<Text
										color={selectedOption === index ? option.color : 'white'}
										bold={selectedOption === index}
									>
										[{option.key.charAt(0).toUpperCase()}] {option.label}
									</Text>
								</Box>
							))}
						</Box>
					</Box>
				)}

				{/* Edit Mode - Text Input */}
				{mode === 'edit' && (
					<Box flexDirection="column" marginTop={1}>
						<Text color="yellow">Describe your changes (Esc to cancel):</Text>
						<Box marginTop={1}>
							<Text color="yellow">{'> '}</Text>
							<TextInput
								key={editKey}
								onSubmit={handleEditSubmit}
								placeholder="e.g., Add a step for testing, be more specific about X..."
							/>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
}

/**
 * Simple plan indicator for the header
 */
export function PlanModeIndicator({ enabled }: { enabled: boolean }) {
	if (!enabled) return null;

	return (
		<>
			<Text color="gray"> | </Text>
			<Text color="cyan">Plan Mode</Text>
		</>
	);
}

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
		<Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={1}>
			{/* Header */}
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					📋 Plan Review
				</Text>
				{isProcessing && (
					<Text color="yellow" dimColor>
						{' '}
						(processing...)
					</Text>
				)}
			</Box>

			{/* Objective */}
			<Box marginBottom={1}>
				<Text color="white" bold>
					Objective:{' '}
				</Text>
				<Text>{plan.objective}</Text>
			</Box>

			{/* Steps */}
			<Box flexDirection="column" marginBottom={1}>
				<Text color="white" bold>
					Steps:
				</Text>
				{plan.steps.map((step, index) => (
					<Box key={step.id}>
						<Text color="gray">
							{index === plan.steps.length - 1 ? '└─ ' : '├─ '}
						</Text>
						<Text color="cyan">{index + 1}. </Text>
						<Text>{step.description}</Text>
					</Box>
				))}
			</Box>

			{/* Review Mode - Options */}
			{mode === 'review' && !isProcessing && (
				<Box flexDirection="column" marginTop={1}>
					<Text color="gray" dimColor>
						Select an option (↑↓ to navigate, Enter to select):
					</Text>
					<Box flexDirection="column" marginTop={1}>
						{options.map((option, index) => (
							<Box key={option.key}>
								<Text color={selectedOption === index ? option.color : 'gray'}>
									{selectedOption === index ? '▸ ' : '  '}
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
							placeholder="e.g., Add a step for testing, combine steps 2 and 3..."
						/>
					</Box>
				</Box>
			)}
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
			<Text color="cyan">📋 Plan Mode</Text>
		</>
	);
}

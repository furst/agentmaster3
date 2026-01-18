import React from 'react';
import { Box, Text } from 'ink';
import { Spinner as InkSpinner } from '@inkjs/ui';

export interface SpinnerProps {
	/** Text to display next to the spinner */
	label?: string;
	/** Color of the spinner */
	color?: string;
}

/**
 * Loading spinner with optional label
 */
export function Spinner({ label }: SpinnerProps) {
	return (
		<Box>
			<InkSpinner />
			{label && (
				<Text color="gray">
					{' '}
					{label}
				</Text>
			)}
		</Box>
	);
}

export interface ThinkingIndicatorProps {
	/** Whether currently thinking */
	isThinking: boolean;
}

/**
 * Thinking indicator for AI responses
 */
export function ThinkingIndicator({ isThinking }: ThinkingIndicatorProps) {
	if (!isThinking) return null;

	return (
		<Box marginTop={1}>
			<InkSpinner />
			<Text color="gray"> Thinking...</Text>
		</Box>
	);
}

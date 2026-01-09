import React from 'react';
import { Text } from 'ink';
import { parseModelDisplay } from '../utils/model.js';

export interface ModelIndicatorProps {
	/** Full model string like "anthropic:claude-sonnet-4-20250514" */
	model?: string;
	/** Whether extended thinking/reasoning is enabled */
	reasoning?: boolean;
}

/**
 * Compact model indicator for display in headers
 * Shows shortened model name and reasoning status
 */
export function ModelIndicator({ model, reasoning }: ModelIndicatorProps) {
	if (!model) {
		return <Text dimColor>no model</Text>;
	}

	const { shortName } = parseModelDisplay(model);

	return (
		<>
			<Text dimColor>{shortName}</Text>
			{reasoning && <Text color="cyan"> +thinking</Text>}
		</>
	);
}

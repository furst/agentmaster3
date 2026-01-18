import React from 'react';
import { Box, Text } from 'ink';

export interface ErrorDisplayProps {
	/** The error to display */
	error: Error | string;
	/** Optional title for the error */
	title?: string;
	/** Optional retry callback */
	onRetry?: () => void;
}

/**
 * Error display component with optional retry action
 */
export function ErrorDisplay({ error, title = 'Error', onRetry }: ErrorDisplayProps) {
	const errorMessage = typeof error === 'string' ? error : error.message;

	return (
		<Box flexDirection="column" marginY={1}>
			<Box>
				<Text color="red" bold>
					{title}:
				</Text>
				<Text color="red"> {errorMessage}</Text>
			</Box>
			{onRetry && (
				<Box marginTop={1}>
					<Text color="gray" dimColor>
						Press r to retry
					</Text>
				</Box>
			)}
		</Box>
	);
}

export interface ApiErrorDisplayProps {
	/** The error to display */
	error: Error;
}

/**
 * Specialized error display for API errors
 */
export function ApiErrorDisplay({ error }: ApiErrorDisplayProps) {
	// Check for common API error patterns
	const isRateLimit = error.message.toLowerCase().includes('rate limit');
	const isAuth = error.message.toLowerCase().includes('api key') ||
		error.message.toLowerCase().includes('unauthorized') ||
		error.message.toLowerCase().includes('authentication');
	const isNetwork = error.message.toLowerCase().includes('network') ||
		error.message.toLowerCase().includes('fetch');

	let suggestion = '';
	if (isRateLimit) {
		suggestion = 'Wait a moment and try again';
	} else if (isAuth) {
		suggestion = 'Check your ANTHROPIC_API_KEY environment variable or config file';
	} else if (isNetwork) {
		suggestion = 'Check your internet connection';
	}

	return (
		<Box flexDirection="column" marginY={1}>
			<Box>
				<Text color="red" bold>
					API Error:
				</Text>
				<Text color="red"> {error.message}</Text>
			</Box>
			{suggestion && (
				<Box marginTop={1}>
					<Text color="yellow" dimColor>
						Suggestion: {suggestion}
					</Text>
				</Box>
			)}
		</Box>
	);
}

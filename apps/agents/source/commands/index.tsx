import React from 'react';
import { Box, Text } from 'ink';

/**
 * Default command - shows help and available commands
 */
export default function Index() {
	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					conductor
				</Text>
				<Text color="gray"> - Multi-agent CLI</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Available commands:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Box>
						<Text color="green">ask</Text>
						<Text color="gray">      General assistant - chat with tools</Text>
					</Box>
					<Box>
						<Text color="green">help</Text>
						<Text color="gray">     Show this help message</Text>
					</Box>
				</Box>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Slash commands (inside agents):</Text>
				<Box marginLeft={2} flexDirection="column">
					<Box>
						<Text color="yellow">/resume</Text>
						<Text color="gray">  Resume a previous conversation</Text>
					</Box>
				</Box>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Examples:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Text color="gray">$ conductor ask</Text>
					<Text color="gray">$ conductor ask --prompt "Explain TypeScript generics"</Text>
				</Box>
			</Box>

			<Box flexDirection="column">
				<Text bold>Configuration:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Text color="gray">API key: Add to .env file or set ANTHROPIC_API_KEY</Text>
					<Text color="gray">Config:  ~/.config/conductor/config.json</Text>
				</Box>
			</Box>
		</Box>
	);
}

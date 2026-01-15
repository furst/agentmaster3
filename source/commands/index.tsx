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
					agentmaster
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
						<Text color="green">resume</Text>
						<Text color="gray">   Resume a previous conversation</Text>
					</Box>
					<Box>
						<Text color="green">help</Text>
						<Text color="gray">     Show this help message</Text>
					</Box>
				</Box>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Examples:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Text color="gray">$ agentmaster ask</Text>
					<Text color="gray">$ agentmaster ask --prompt "Explain TypeScript generics"</Text>
					<Text color="gray">$ agentmaster resume</Text>
					<Text color="gray">$ agentmaster resume --agent ask</Text>
				</Box>
			</Box>

			<Box flexDirection="column">
				<Text bold>Configuration:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Text color="gray">API key: Add to .env file or set ANTHROPIC_API_KEY</Text>
					<Text color="gray">Config:  ~/.config/agentmaster/config.json</Text>
				</Box>
			</Box>
		</Box>
	);
}

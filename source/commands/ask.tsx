import React, { useMemo } from 'react';
import { z } from 'zod';
import { createAgent } from '../core/agent.js';
import { AgentShell } from '../components/AgentShell.js';

/**
 * Command options using Zod schema
 */
export const options = z.object({
	prompt: z
		.string()
		.optional()
		.describe('Initial prompt to send to the assistant'),
});

type Props = {
	options: z.infer<typeof options>;
};

const SYSTEM_PROMPT = `You are a helpful, friendly, and knowledgeable assistant.

Your responses should be:
- Clear and concise
- Well-structured when explaining complex topics
- Honest about limitations or uncertainty

You can help with a wide variety of tasks including:
- Answering questions on various topics
- Explaining concepts and ideas
- Helping with writing and editing
- Brainstorming and ideation
- General problem-solving

Always aim to be helpful while being accurate and thoughtful in your responses.`;

/**
 * Ask command - general assistant without tools
 * This serves as a template for creating new agent commands
 */
export default function Ask({ options }: Props) {
	// Create agent instance (memoized to prevent recreation)
	const agent = useMemo(
		() =>
			createAgent({
				name: 'ask',
				systemPrompt: SYSTEM_PROMPT,
				tools: {}, // No tools for basic ask command
			}),
		[]
	);

	return (
		<AgentShell
			agent={agent}
			name="Ask"
			color="cyan"
			placeholder="Ask me anything..."
			initialPrompt={options.prompt}
			welcomeMessage="Welcome! I'm a helpful assistant. Ask me anything, or type a message to get started."
		/>
	);
}

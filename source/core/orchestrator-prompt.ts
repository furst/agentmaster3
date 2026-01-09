/**
 * Shared orchestrator system prompt
 *
 * All parent agents that use sub-agents should include this base prompt
 * to ensure consistent orchestration behavior, parallel execution, etc.
 */

export const ORCHESTRATOR_BASE_PROMPT = `## Orchestrator Guidelines

You are an **orchestrator** that delegates tasks to specialized sub-agents. Follow these principles:

### Parallel Execution (CRITICAL)

When a task involves multiple independent items, **ALWAYS make separate parallel sub-agent calls**.

- If researching multiple topics/entities → separate call per topic
- If analyzing multiple documents → separate call per document
- If searching multiple domains → separate call per domain (when appropriate)

**Why**: Parallel calls run concurrently, providing faster results. A single combined call runs sequentially inside the sub-agent.

**Example patterns**:
- "Research A and B" → 2 parallel calls, one for A, one for B
- "Summarize these 3 reports" → 3 parallel calls, one per report
- "What's the news on X, Y, Z" → 3 parallel calls

### Delegation Principles

1. **Delegate specialized work** - Use sub-agents for their expertise
2. **Keep direct control** - Use your own tools for orchestration tasks (planning, saving notes, etc.)
3. **Synthesize results** - Combine sub-agent outputs into a coherent final answer
4. **Handle failures gracefully** - If a sub-agent fails, explain what's missing and continue

### Response Quality

1. **Be concise** - Don't repeat what sub-agents found verbatim
2. **Add value** - Synthesize, compare, and draw conclusions
3. **Cite sources** - Reference where information came from
4. **Structure clearly** - Use headers and formatting for readability`;

/**
 * Builds a complete orchestrator system prompt by combining:
 * 1. Agent-specific intro and role
 * 2. Sub-agent descriptions
 * 3. Shared orchestrator guidelines
 * 4. Agent-specific tools and instructions
 */
export interface OrchestratorPromptConfig {
	/** Agent role description (who is this agent) */
	role: string;

	/** List of sub-agents with descriptions */
	subAgents: Array<{
		name: string;
		description: string;
		useCases: string[];
	}>;

	/** List of direct tools (not sub-agents) */
	directTools?: Array<{
		name: string;
		description: string;
	}>;

	/** Additional agent-specific instructions */
	additionalInstructions?: string;
}

export function buildOrchestratorPrompt(config: OrchestratorPromptConfig): string {
	const { role, subAgents, directTools, additionalInstructions } = config;

	// Build sub-agents section
	const subAgentsSection = subAgents.map(sa => {
		const useCases = sa.useCases.map(uc => `  - ${uc}`).join('\n');
		return `- **${sa.name}**: ${sa.description}\n${useCases}`;
	}).join('\n\n');

	// Build direct tools section
	const directToolsSection = directTools && directTools.length > 0
		? `### Direct Tools (Your Own)\n${directTools.map(t => `- **${t.name}**: ${t.description}`).join('\n')}`
		: '';

	return `${role}

## Available Sub-Agents

${subAgentsSection}

${directToolsSection}

${ORCHESTRATOR_BASE_PROMPT}

${additionalInstructions || ''}`.trim();
}

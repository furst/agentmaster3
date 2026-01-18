/**
 * Shared orchestrator system prompt
 *
 * All parent agents that use sub-agents should include this base prompt
 * to ensure consistent orchestration behavior, parallel execution, etc.
 */

export const ORCHESTRATOR_BASE_PROMPT = `## Tool Usage Guidelines

### Direct Tools vs Task (IMPORTANT)

**Prefer direct tools for simple operations:**
- Single web search → use \`web_search\` directly
- Fetch a specific URL → use \`web_fetch\` directly
- Quick factual question → use \`web_answer\` directly
- Read a single file/PDF → use the read tool directly

**Use task(explore) only for complex multi-step research:**
- When you need to search, read results, then search again
- When synthesizing information from multiple sources
- When the research requires autonomous exploration

**CRITICAL: Only ONE tool call at a time.** Never call multiple tools in parallel.
Always wait for one tool to complete before calling the next.
If you need to research multiple topics, give the task a prompt that covers all topics in one call.

### Delegation Principles

1. **Prefer direct tools** - Only use task for genuinely complex research
2. **Keep direct control** - Use your own tools for simple operations
3. **Synthesize results** - Combine outputs into a coherent final answer
4. **Handle failures gracefully** - If something fails, explain what's missing and continue

### Response Quality

1. **Be concise** - Don't repeat tool outputs verbatim
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

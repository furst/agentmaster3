/**
 * Generic, reusable sub-agents
 *
 * These sub-agents can be composed into parent agents to create
 * hierarchical agent architectures. Each sub-agent is specialized
 * for a specific domain and uses the light model for cost efficiency.
 */

export { createPdfAgent } from './pdf-agent.js';
export { createWebResearchAgent } from './web-research-agent.js';
export { createVaultAgent } from './vault-agent.js';

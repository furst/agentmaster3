import { tool, type Tool } from 'ai';
import { z } from 'zod';

// Re-export with consistent naming
export type CoreTool = Tool;

export interface ToolDefinition<T extends z.ZodObject<z.ZodRawShape>> {
	name: string;
	description: string;
	parameters: T;
	execute: (params: z.infer<T>, context?: ToolContext) => Promise<unknown>;
}

export interface ToolContext {
	toolCallId: string;
	messages: unknown[];
	abortSignal?: AbortSignal;
	sessionId?: string;
}

/**
 * Helper function to define a tool with type-safe parameters
 * Wraps the AI SDK's tool() function with a consistent API
 *
 * @example
 * const readFileTool = defineTool({
 *   name: 'read_file',
 *   description: 'Read contents of a local file',
 *   parameters: z.object({
 *     path: z.string().describe('Path to the file'),
 *   }),
 *   execute: async ({ path }) => {
 *     const content = await fs.readFile(path, 'utf-8');
 *     return { content, path };
 *   },
 * });
 */
interface ToolExecuteContext {
	toolCallId: string;
	messages: unknown[];
	abortSignal?: AbortSignal;
	sessionId?: string;
}

export function defineTool<T extends z.ZodObject<z.ZodRawShape>>(
	definition: ToolDefinition<T>
): { name: string; tool: CoreTool } {
	const { name, description, parameters, execute } = definition;

	const wrappedTool = tool({
		description,
		inputSchema: parameters,
		execute: async (params: z.infer<T>, context: ToolExecuteContext) => {
			const toolContext: ToolContext = {
				toolCallId: context.toolCallId,
				messages: context.messages,
				abortSignal: context.abortSignal,
				sessionId: context.sessionId,
			};
			return execute(params, toolContext);
		},
	});

	return {
		name,
		tool: wrappedTool,
	};
}

/**
 * Creates a tools record from an array of tool definitions
 * Useful for passing to the LLM functions
 *
 * @example
 * const tools = createToolsRecord([readFileTool, webSearchTool]);
 * // Returns: { read_file: CoreTool, web_search: CoreTool }
 */
export function createToolsRecord(
	tools: Array<{ name: string; tool: CoreTool }>
): Record<string, CoreTool> {
	const record: Record<string, CoreTool> = {};

	for (const { name, tool: t } of tools) {
		record[name] = t;
	}

	return record;
}

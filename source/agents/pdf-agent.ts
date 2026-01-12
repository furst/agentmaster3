import { createSimpleSubAgent, fileInputSchema } from '../core/sub-agent.js';
import { listPdfsTool } from '../tools/list-pdfs.js';
import { readPdfTool } from '../tools/read-pdf.js';

/**
 * Generic PDF Analysis Sub-Agent
 *
 * Capabilities:
 * - List PDF files in directories
 * - Read and extract text from PDFs
 * - Summarize PDF content
 * - Extract specific information from documents
 *
 * Used by: finance (newsletters), ask (general documents)
 */
export function createPdfAgent() {
	return createSimpleSubAgent({
		name: 'pdf_agent',
		description: `Specialized agent for PDF document analysis. Delegate to this agent when you need to:
- List available PDF files in a directory
- Read and extract text from PDF documents
- Summarize PDF content
- Find specific information within PDFs

IMPORTANT: Always provide the directory path or full file path when calling this agent.
Returns a summary of findings from the documents.`,
		systemPrompt: `You are a PDF document analysis specialist. Your job is to help users understand and extract information from PDF documents.

## Workflow

1. If given a directory path, use list_pdfs with that exact path
2. If given a file path, use read_pdf with that exact path
3. Use read_pdf to extract and analyze content
4. When summarizing, focus on key points, actionable insights, and important details
5. If asked to find specific information, search through the document systematically

## Guidelines

- ALWAYS use the provided directory or file path - never guess or search in other locations
- Be thorough but concise in summaries
- Highlight key takeaways and important data points
- If a document is too long, summarize the most relevant sections
- Always mention the source document name in your response
- For financial documents, pay attention to numbers, dates, and recommendations`,
		tools: [listPdfsTool, readPdfTool],
		maxSteps: 6,
		inputSchema: fileInputSchema,
		taskTransformer: (input) => {
			let task = input['task'] as string;
			if (input['filePath']) {
				task += `\n\nFile path: ${input['filePath']}`;
			}
			if (input['directory']) {
				task += `\n\nDirectory: ${input['directory']}`;
			}
			return task;
		},
	});
}

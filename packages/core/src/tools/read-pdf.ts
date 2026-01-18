import { readFile, stat } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { z } from 'zod';
import { defineTool } from '../core/tools.js';
import { generateWithModel } from '../core/multi-model.js';
import { getModelsConfig } from '../core/project-config.js';
import { PDFParse } from 'pdf-parse';

/**
 * Read PDF tool - extracts text from PDF and optionally summarizes with light model
 */
export const readPdfTool = defineTool({
	name: 'read_pdf',
	description:
		'Read and extract text from a PDF file. Can optionally use AI to summarize or extract specific information. Use this to analyze documents, reports, articles, or any PDF.',
	parameters: z.object({
		path: z.string().describe('The absolute or relative path to the PDF file'),
		summarize: z
			.boolean()
			.optional()
			.default(true)
			.describe('If true, use AI to summarize and extract key points. If false, return raw text.'),
		extractionPrompt: z
			.string()
			.optional()
			.describe('Custom prompt for what to extract. Default extracts key points and summary.'),
		maxTextLength: z
			.number()
			.optional()
			.default(100000)
			.describe('Maximum characters of raw text to process'),
	}),
	execute: async ({ path, summarize, extractionPrompt, maxTextLength }) => {
		try {
			const resolvedPath = isAbsolute(path) ? path : resolve(process.cwd(), path);

			// Check file exists
			const stats = await stat(resolvedPath);
			if (!stats.isFile()) {
				return {
					success: false,
					error: `Not a file: ${resolvedPath}`,
					path: resolvedPath,
				};
			}

			// Read and parse PDF
			const buffer = await readFile(resolvedPath);
			const parser = new PDFParse({ data: buffer });
			const textResult = await parser.getText();
			await parser.destroy();

			// Get full text
			let fullText = textResult.text;
			const pageCount = textResult.pages.length;

			// Truncate text if needed
			const truncated = fullText.length > maxTextLength;
			if (truncated) {
				fullText = fullText.slice(0, maxTextLength);
			}

			// Return raw text if not summarizing
			if (!summarize) {
				return {
					success: true,
					path: resolvedPath,
					pageCount,
					textLength: textResult.text.length,
					truncated,
					content: fullText,
				};
			}

			// Use light model to summarize/extract
			const modelsConfig = getModelsConfig();
			const lightModel = modelsConfig.light;

			const defaultPrompt = `Analyze this document and extract:

1. **Summary**: A brief overview of what this document is about
2. **Key Points**: The main takeaways or important information
3. **Notable Sections**: Any particularly relevant sections or data
4. **Action Items**: Any recommendations, next steps, or calls to action (if applicable)

Be concise but comprehensive. Format your response with clear headers.`;

			const prompt = extractionPrompt || defaultPrompt;

			const summary = await generateWithModel(lightModel, {
				system: 'You are a skilled document analyst. Extract and summarize information from documents clearly and concisely.',
				prompt: `${prompt}\n\n---\n\nDocument content:\n\n${fullText}`,
				maxOutputTokens: 2048,
			});

			return {
				success: true,
				path: resolvedPath,
				pageCount,
				textLength: textResult.text.length,
				truncated,
				modelUsed: lightModel,
				summary,
			};
		} catch (error) {
			const err = error as NodeJS.ErrnoException;

			if (err.code === 'ENOENT') {
				return {
					success: false,
					error: `File not found: ${path}`,
					path,
				};
			}

			return {
				success: false,
				error: `Failed to read PDF: ${err.message}`,
				path,
			};
		}
	},
});

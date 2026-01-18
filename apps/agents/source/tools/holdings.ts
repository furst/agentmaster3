import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve, isAbsolute, join, extname, dirname } from 'node:path';
import { z } from 'zod';
import { generateText } from 'ai';
import { defineTool, createMultiModel } from '@conductor/core';
import { getFinanceConfig } from '../config/finance-config.js';

/**
 * Holding structure
 */
interface Holding {
	name: string;
	ticker?: string;
	isin?: string;
	shares: number;
	avgPrice?: number;
	currentPrice?: number;
	value: number;
	currency: string;
	changePercent?: number;
	account?: string;
}

interface HoldingsData {
	updatedAt: string;
	source: string;
	totalValue?: number;
	holdings: Holding[];
}

const HOLDINGS_FILE = 'holdings.json';
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Get the holdings directory path from config
 */
function getHoldingsDir(): string {
	const config = getFinanceConfig();
	const dir = config.holdingsDirectory || './data/holdings';
	return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/**
 * Get the holdings JSON file path
 */
function getHoldingsFilePath(): string {
	const dir = getHoldingsDir();
	return join(dir, HOLDINGS_FILE);
}

/**
 * Parse holdings image tool - uses vision model to extract holdings from screenshot
 */
export const parseHoldingsImageTool = defineTool({
	name: 'parse_holdings_image',
	description: `Parse a screenshot of the user's holdings (from Avanza or similar) using AI vision. Extracts holdings data and saves to holdings.json. The user drops an image into the chat which provides the imagePath.`,
	parameters: z.object({
		imagePath: z
			.string()
			.describe('Full path to the image file to parse. Extract this from the user message (e.g., "[Image #1: /path/to/image.png]").'),
	}),
	execute: async ({ imagePath }) => {
		try {
			const config = getFinanceConfig();

			// Resolve the path
			const resolvedPath = isAbsolute(imagePath) ? imagePath : resolve(process.cwd(), imagePath);

			// Verify the file exists
			try {
				await stat(resolvedPath);
			} catch {
				return {
					success: false,
					error: `Image file not found: ${resolvedPath}`,
				};
			}

			// Verify it's a supported image format
			const ext = extname(resolvedPath).toLowerCase();
			if (!IMAGE_EXTENSIONS.includes(ext)) {
				return {
					success: false,
					error: `Not a supported image format. Supported: ${IMAGE_EXTENSIONS.join(', ')}`,
					providedPath: resolvedPath,
				};
			}

			const imageName = resolvedPath.split('/').pop() || 'image';

			// Read the image
			const imageBuffer = await readFile(resolvedPath);
			const base64Image = imageBuffer.toString('base64');
			const mimeType = imageName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

			// Use light model (Gemini Flash) for vision
			const model = createMultiModel(config.lightModel);

			const result = await generateText({
				model,
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'image',
								image: `data:${mimeType};base64,${base64Image}`,
							},
							{
								type: 'text',
								text: `Extract all stock holdings from this Avanza (Swedish broker) screenshot.

CRITICAL: Return ONLY valid, complete JSON. No text before or after. Ensure the JSON is properly closed with all brackets.

Format:
{"totalValue":123456,"holdings":[{"name":"Company","ticker":"TICK","shares":10,"avgPrice":100.5,"currentPrice":105,"value":1050,"currency":"SEK","changePercent":4.5}]}

Fields:
- name: company name
- ticker: stock symbol if visible (AAPL, NVDA, VOLV-B)
- shares: number owned (Antal)
- avgPrice: GAV if shown
- currentPrice: current price
- value: market value (Marknadsvärde)
- currency: SEK/USD/EUR
- changePercent: gain/loss %

Use null for missing fields. Include ALL visible holdings. MUST end with proper closing brackets: }]}`,
							},
						],
					},
				],
				maxOutputTokens: 8192,
			});

			// Parse the JSON response
			let holdingsData: { totalValue?: number; holdings: Holding[] };
			try {
				// Extract JSON from response (handle markdown code blocks)
				let jsonText = result.text.trim();
				if (jsonText.startsWith('```json')) {
					jsonText = jsonText.slice(7);
				}
				if (jsonText.startsWith('```')) {
					jsonText = jsonText.slice(3);
				}
				if (jsonText.endsWith('```')) {
					jsonText = jsonText.slice(0, -3);
				}
				jsonText = jsonText.trim();

				// Try to fix truncated JSON by closing brackets
				if (!jsonText.endsWith(']}')) {
					// Find last complete holding entry
					const lastCompleteIndex = jsonText.lastIndexOf('},');
					if (lastCompleteIndex > 0) {
						jsonText = jsonText.slice(0, lastCompleteIndex + 1) + ']}';
					} else if (jsonText.includes('"holdings":[')) {
						// No complete holdings, just close the array
						jsonText = jsonText.replace(/"holdings":\[.*$/, '"holdings":[]}');
					}
				}

				holdingsData = JSON.parse(jsonText);
			} catch (parseError) {
				const err = parseError as Error;
				return {
					success: false,
					error: `Failed to parse AI response as JSON: ${err.message}`,
					rawResponseLength: result.text.length,
					rawResponseStart: result.text.slice(0, 300),
					rawResponseEnd: result.text.slice(-300),
				};
			}

			// Create the full holdings data structure
			const fullData: HoldingsData = {
				updatedAt: new Date().toISOString().split('T')[0] || new Date().toISOString(),
				source: imageName,
				totalValue: holdingsData.totalValue,
				holdings: holdingsData.holdings,
			};

			// Ensure directory exists
			const outputPath = getHoldingsFilePath();
			await mkdir(dirname(outputPath), { recursive: true });

			// Save to JSON file
			await writeFile(outputPath, JSON.stringify(fullData, null, 2), 'utf-8');

			return {
				success: true,
				parsedFrom: imageName,
				savedTo: outputPath,
				holdingsCount: fullData.holdings.length,
				totalValue: fullData.totalValue,
				holdings: fullData.holdings.map(h => ({
					name: h.name,
					ticker: h.ticker,
					shares: h.shares,
					value: h.value,
				})),
			};
		} catch (error) {
			const err = error as Error;
			return {
				success: false,
				error: `Failed to parse holdings image: ${err.message}`,
			};
		}
	},
});

/**
 * Read holdings tool - reads the parsed holdings JSON
 */
export const readHoldingsTool = defineTool({
	name: 'read_holdings',
	description: `Read the user's current stock holdings from the saved holdings.json file. Use this to answer questions about the portfolio.`,
	parameters: z.object({
		ticker: z
			.string()
			.optional()
			.describe('Filter by ticker symbol (partial match)'),
	}),
	execute: async ({ ticker }) => {
		try {
			const filePath = getHoldingsFilePath();
			const content = await readFile(filePath, 'utf-8');
			const data: HoldingsData = JSON.parse(content);

			let holdings = data.holdings;

			// Filter by ticker if provided
			if (ticker) {
				const search = ticker.toLowerCase();
				holdings = holdings.filter(
					h =>
						h.ticker?.toLowerCase().includes(search) ||
						h.name.toLowerCase().includes(search)
				);
			}

			// Calculate totals
			const totalValue = holdings.reduce((sum, h) => sum + (h.value || 0), 0);

			return {
				success: true,
				updatedAt: data.updatedAt,
				source: data.source,
				holdingsCount: holdings.length,
				totalValue: ticker ? totalValue : data.totalValue || totalValue,
				holdings: holdings.map(h => ({
					name: h.name,
					ticker: h.ticker,
					shares: h.shares,
					avgPrice: h.avgPrice,
					currentPrice: h.currentPrice,
					value: h.value,
					currency: h.currency,
					changePercent: h.changePercent,
					account: h.account,
				})),
			};
		} catch (error) {
			const err = error as NodeJS.ErrnoException;

			if (err.code === 'ENOENT') {
				return {
					success: false,
					error: 'No holdings data found. Ask the user to drop a holdings screenshot into the chat.',
				};
			}

			return {
				success: false,
				error: `Failed to read holdings: ${err.message}`,
			};
		}
	},
});

import { ContentCardType } from '../components/ContentCard.js';

/**
 * Represents a parsed content segment
 */
export interface ContentSegment {
	type: 'text' | 'card';
	content: string;
	cardType?: ContentCardType;
	title?: string;
}

/**
 * Valid card type markers
 */
const validCardTypes: ContentCardType[] = [
	'recipe',
	'news',
	'finance',
	'summary',
	'list',
	'info',
	'warning',
	'success',
];

/**
 * Parses message content for special card markers
 *
 * Format:
 *   :::type "Optional Title"
 *   Content here...
 *   :::
 *
 * Examples:
 *   :::recipe "Pasta Carbonara"
 *   Ingredients:
 *   - 400g spaghetti
 *   - 200g pancetta
 *   :::
 *
 *   :::news "Breaking News"
 *   Article content here...
 *   :::
 *
 *   :::finance
 *   Portfolio summary...
 *   :::
 */
export function parseContentWithCards(content: string): ContentSegment[] {
	const segments: ContentSegment[] = [];

	// Normalize: ensure ::: markers are on their own lines
	// This handles cases where LLM outputs "text:::finance" without a newline
	const normalizedContent = content
		.replace(/([^\n]):::(\w)/g, '$1\n:::$2') // Add newline before opening :::
		.replace(/([^\n]):::(\s*)$/gm, '$1\n:::$2'); // Add newline before closing :::

	// Regex to match card blocks: :::type "optional title"\ncontent\n:::
	// The type must be a valid card type, title is optional
	const cardBlockRegex = /^:::(\w+)(?:\s+"([^"]*)")?\s*\n([\s\S]*?)^:::\s*$/gm;

	let lastIndex = 0;
	let match;

	while ((match = cardBlockRegex.exec(normalizedContent)) !== null) {
		const [fullMatch, type, title, cardContent] = match;
		const startIndex = match.index;

		// Add any text before this card
		if (startIndex > lastIndex) {
			const textBefore = normalizedContent.slice(lastIndex, startIndex).trim();
			if (textBefore) {
				segments.push({
					type: 'text',
					content: textBefore,
				});
			}
		}

		// Check if type is valid
		if (type && cardContent) {
			const cardType = type.toLowerCase() as ContentCardType;
			if (validCardTypes.includes(cardType)) {
				segments.push({
					type: 'card',
					content: cardContent.trim(),
					cardType,
					title: title || undefined,
				});
			} else {
				// Invalid type, treat as text
				segments.push({
					type: 'text',
					content: fullMatch,
				});
			}
		} else {
			// Missing parts, treat as text
			segments.push({
				type: 'text',
				content: fullMatch,
			});
		}

		lastIndex = startIndex + fullMatch.length;
	}

	// Add any remaining text after the last card
	if (lastIndex < normalizedContent.length) {
		const remaining = normalizedContent.slice(lastIndex).trim();
		if (remaining) {
			segments.push({
				type: 'text',
				content: remaining,
			});
		}
	}

	// If no cards found, return single text segment
	if (segments.length === 0) {
		return [{ type: 'text', content }];
	}

	return segments;
}

/**
 * Checks if content contains any card markers
 * Looks for ::: followed by a valid card type anywhere in the content
 */
export function hasCardMarkers(content: string): boolean {
	const cardTypePattern = validCardTypes.join('|');
	const regex = new RegExp(`:::(?:${cardTypePattern})`, 'i');
	return regex.test(content);
}

/**
 * Strips card markers from content (for non-rendering contexts)
 */
export function stripCardMarkers(content: string): string {
	return content
		.replace(/^:::(\w+)(?:\s+"([^"]*)")?\s*$/gm, '')
		.replace(/^:::\s*$/gm, '')
		.trim();
}

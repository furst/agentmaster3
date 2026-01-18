/**
 * Personal Obsidian hooks for tag inference and frontmatter generation
 *
 * These hooks customize how notes are created in the Obsidian vault.
 * Register these at app startup to enable personal tagging behavior.
 */

import { registerObsidianHooks } from '@conductor/core';

/**
 * Infers tags based on content and path (personal preferences)
 */
function inferTags(content: string, path: string): string[] {
	const tags: string[] = ['idea', 'agent']; // Always add these tags
	const contentLower = content.toLowerCase();
	const pathLower = path.toLowerCase();

	// Recipe detection
	if (
		pathLower.includes('recipe') ||
		pathLower.includes('cook') ||
		contentLower.includes('ingredients') ||
		contentLower.includes('instructions') ||
		contentLower.includes('servings') ||
		contentLower.includes('prep time') ||
		contentLower.includes('cook time')
	) {
		tags.push('cooking/recipe');
	}

	// Guide/tutorial detection
	if (
		pathLower.includes('guide') ||
		pathLower.includes('tutorial') ||
		pathLower.includes('how-to') ||
		contentLower.includes('step 1') ||
		contentLower.includes('## steps')
	) {
		tags.push('guide');
	}

	// Tech/code detection
	if (
		contentLower.includes('```') ||
		contentLower.includes('function') ||
		contentLower.includes('const ') ||
		contentLower.includes('import ')
	) {
		tags.push('tech', 'code');
	}

	return [...new Set(tags)]; // Remove duplicates
}

/**
 * Generates frontmatter for a new note (personal format)
 */
function generateFrontmatter(tags: string[], type?: string): string {
	const tagLines = tags.map(t => `  - ${t}`).join('\n');
	return `---
tags:
${tagLines}
status:
type: ${type || ''}
---

`;
}

/**
 * Register personal obsidian hooks
 * Call this at app startup to enable custom tag inference and frontmatter
 */
export function registerPersonalObsidianHooks(): void {
	registerObsidianHooks({
		tagInference: inferTags,
		frontmatterGenerator: generateFrontmatter,
	});
}

/**
 * Model display utilities for parsing and shortening model names
 */

export interface ModelDisplayInfo {
	provider: string;
	shortName: string;
	fullName: string;
}

/**
 * Parse a model string and extract display-friendly information
 * @param modelString Full model string like "anthropic:claude-sonnet-4-20250514" or just "claude-sonnet-4-20250514"
 */
export function parseModelDisplay(modelString: string): ModelDisplayInfo {
	// Split provider:model format
	const colonIndex = modelString.indexOf(':');
	let provider: string;
	let fullName: string;

	if (colonIndex > 0) {
		provider = modelString.slice(0, colonIndex);
		fullName = modelString.slice(colonIndex + 1);
	} else {
		// No provider prefix, try to infer from model name
		provider = inferProvider(modelString);
		fullName = modelString;
	}

	const shortName = shortenModelName(fullName, provider);

	return {
		provider,
		shortName,
		fullName,
	};
}

/**
 * Infer the provider from a model name without prefix
 */
function inferProvider(modelName: string): string {
	if (modelName.includes('claude') || modelName.includes('sonnet') || modelName.includes('opus') || modelName.includes('haiku')) {
		return 'anthropic';
	}
	if (modelName.includes('gemini') || modelName.includes('palm')) {
		return 'google';
	}
	if (modelName.includes('gpt') || modelName.includes('o1') || modelName.includes('o3')) {
		return 'openai';
	}
	return 'unknown';
}

/**
 * Shorten a model name to a compact display format
 */
function shortenModelName(fullName: string, provider: string): string {
	// Anthropic models
	if (provider === 'anthropic') {
		// claude-opus-4-5-20250514 -> opus-4.5
		if (fullName.includes('opus-4-5') || fullName.includes('opus-4.5')) {
			return 'opus-4.5';
		}
		// claude-opus-4-20250514 -> opus-4
		if (fullName.includes('opus-4')) {
			return 'opus-4';
		}
		// claude-sonnet-4-5-20250514 -> sonnet-4.5
		if (fullName.includes('sonnet-4-5') || fullName.includes('sonnet-4.5')) {
			return 'sonnet-4.5';
		}
		// claude-sonnet-4-20250514 -> sonnet-4
		if (fullName.includes('sonnet-4')) {
			return 'sonnet-4';
		}
		// claude-3-5-sonnet -> sonnet-3.5
		if (fullName.includes('3-5-sonnet') || fullName.includes('3.5-sonnet')) {
			return 'sonnet-3.5';
		}
		// claude-3-opus -> opus-3
		if (fullName.includes('3-opus')) {
			return 'opus-3';
		}
		// claude-3-haiku -> haiku-3
		if (fullName.includes('haiku')) {
			return 'haiku-3';
		}
		// Fallback: remove 'claude-' prefix and date suffix
		return fullName.replace(/^claude-/, '').replace(/-\d{8}$/, '');
	}

	// Google models
	if (provider === 'google') {
		// gemini-2.5-flash-preview-05-20 -> gemini-flash
		if (fullName.includes('flash')) {
			// Extract version if present
			const versionMatch = fullName.match(/gemini-(\d+\.?\d*)-flash/);
			if (versionMatch) {
				return `gemini-${versionMatch[1]}-flash`;
			}
			return 'gemini-flash';
		}
		// gemini-2.5-pro-preview -> gemini-pro
		if (fullName.includes('pro')) {
			const versionMatch = fullName.match(/gemini-(\d+\.?\d*)-pro/);
			if (versionMatch) {
				return `gemini-${versionMatch[1]}-pro`;
			}
			return 'gemini-pro';
		}
		// Fallback: remove preview/date suffixes
		return fullName.replace(/-preview.*$/, '').replace(/-\d{2}-\d{2}$/, '');
	}

	// OpenAI models
	if (provider === 'openai') {
		// gpt-4o-2024-08-06 -> gpt-4o
		if (fullName.includes('gpt-4o')) {
			return 'gpt-4o';
		}
		// gpt-4-turbo -> gpt-4-turbo
		if (fullName.includes('gpt-4-turbo')) {
			return 'gpt-4-turbo';
		}
		// gpt-4 -> gpt-4
		if (fullName.includes('gpt-4')) {
			return 'gpt-4';
		}
		// o1-preview -> o1
		if (fullName.startsWith('o1')) {
			return 'o1';
		}
		// o3-mini -> o3-mini
		if (fullName.startsWith('o3')) {
			return fullName.includes('mini') ? 'o3-mini' : 'o3';
		}
		return fullName.replace(/-\d{4}-\d{2}-\d{2}$/, '');
	}

	// Unknown provider - return as-is but try to clean up date suffixes
	return fullName.replace(/-\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

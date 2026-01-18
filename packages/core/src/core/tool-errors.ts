/**
 * Tool Error Handling Utilities
 *
 * Standardized error handling for tool operations.
 */

/**
 * Standard tool error response shape
 */
export interface ToolErrorResult {
	success: false;
	error: string;
	code?: string;
	[key: string]: unknown;
}

/**
 * Standard tool success response shape
 */
export interface ToolSuccessResult {
	success: true;
	[key: string]: unknown;
}

export type ToolResult = ToolSuccessResult | ToolErrorResult;

/**
 * Creates a standardized error result for tools
 */
export function toolError(error: string, extra?: Record<string, unknown>): ToolErrorResult {
	return {
		success: false,
		error,
		...extra,
	};
}

/**
 * Creates a standardized success result for tools
 */
export function toolSuccess<T extends Record<string, unknown>>(data: T): T & { success: true } {
	return {
		success: true,
		...data,
	};
}

/**
 * Handles common file system errors and returns appropriate tool error responses.
 * Use this in catch blocks when dealing with file operations.
 *
 * @example
 * try {
 *   const content = await readFile(path);
 *   return toolSuccess({ content });
 * } catch (error) {
 *   return handleFileError(error, { path });
 * }
 */
export function handleFileError(
	error: unknown,
	context?: Record<string, unknown>
): ToolErrorResult {
	const err = error as NodeJS.ErrnoException;
	const path = context?.['path'] ?? context?.['directory'] ?? context?.['filePath'] ?? '';

	switch (err.code) {
		case 'ENOENT':
			return toolError(`Not found: ${path}`, { code: 'ENOENT', ...context });

		case 'EACCES':
			return toolError(`Permission denied: ${path}`, { code: 'EACCES', ...context });

		case 'EISDIR':
			return toolError(`Expected file but found directory: ${path}`, { code: 'EISDIR', ...context });

		case 'ENOTDIR':
			return toolError(`Expected directory but found file: ${path}`, { code: 'ENOTDIR', ...context });

		case 'EMFILE':
		case 'ENFILE':
			return toolError('Too many open files', { code: err.code, ...context });

		case 'ENOSPC':
			return toolError('No space left on device', { code: 'ENOSPC', ...context });

		default:
			return toolError(
				err.message || 'Unknown file system error',
				{ code: err.code, ...context }
			);
	}
}

/**
 * Handles network/API errors and returns appropriate tool error responses.
 *
 * @example
 * try {
 *   const response = await fetch(url);
 *   return toolSuccess({ data: await response.json() });
 * } catch (error) {
 *   return handleNetworkError(error, { url });
 * }
 */
export function handleNetworkError(
	error: unknown,
	context?: Record<string, unknown>
): ToolErrorResult {
	const err = error as Error & { code?: string; status?: number };

	// Timeout errors
	if (err.name === 'AbortError' || err.code === 'ETIMEDOUT') {
		return toolError('Request timed out', { code: 'TIMEOUT', ...context });
	}

	// Connection errors
	if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
		return toolError('Connection failed', { code: err.code, ...context });
	}

	// HTTP errors
	if (err.status) {
		const statusMessages: Record<number, string> = {
			400: 'Bad request',
			401: 'Unauthorized',
			403: 'Forbidden',
			404: 'Not found',
			429: 'Rate limited',
			500: 'Server error',
			502: 'Bad gateway',
			503: 'Service unavailable',
		};
		const message = statusMessages[err.status] ?? `HTTP error ${err.status}`;
		return toolError(message, { code: `HTTP_${err.status}`, status: err.status, ...context });
	}

	return toolError(err.message || 'Network error', { ...context });
}

/**
 * Wraps a tool execution with standard error handling.
 * Catches errors and returns standardized error responses.
 *
 * @example
 * export const myTool = defineTool({
 *   name: 'my_tool',
 *   execute: withErrorHandling(async ({ path }) => {
 *     const content = await readFile(path);
 *     return toolSuccess({ content });
 *   }),
 * });
 */
export function withErrorHandling<TParams, TResult extends ToolResult>(
	fn: (params: TParams) => Promise<TResult>,
	errorHandler: (error: unknown, params: TParams) => ToolErrorResult = (error) =>
		toolError((error as Error).message)
): (params: TParams) => Promise<TResult | ToolErrorResult> {
	return async (params: TParams) => {
		try {
			return await fn(params);
		} catch (error) {
			return errorHandler(error, params);
		}
	};
}

import React from 'react';
import { Box, Text, Static } from 'ink';
import { ContentCard } from './ContentCard.js';
import { parseContentWithCards, hasCardMarkers } from '../utils/content-parser.js';

export interface MessageProps {
	/** Message role */
	role: 'user' | 'assistant';
	/** Message content */
	content: string;
	/** Whether the message is currently streaming */
	isStreaming?: boolean;
	/** Custom color for the message */
	color?: string;
}

/**
 * Renders a conversation message with role-based styling
 * Supports ContentCard markers for highlighted sections
 */
export function Message({ role, content, isStreaming, color }: MessageProps) {
	const isUser = role === 'user';
	const prefix = isUser ? '>' : '';
	const textColor = color ?? (isUser ? 'green' : 'white');

	// For assistant messages, check for card markers
	const shouldParseCards = !isUser && !isStreaming && hasCardMarkers(content);

	if (shouldParseCards) {
		const segments = parseContentWithCards(content);

		return (
			<Box flexDirection="column" marginY={1}>
				{segments.map((segment, index) => {
					if (segment.type === 'card' && segment.cardType) {
						return (
							<ContentCard
								key={`card-${index}`}
								type={segment.cardType}
								title={segment.title}
								content={segment.content}
							/>
						);
					}
					// Add margin between text and following card
					const nextSegment = segments[index + 1];
					const needsBottomMargin = nextSegment?.type === 'card';
					return (
						<Box key={`text-${index}`} marginBottom={needsBottomMargin ? 1 : 0}>
							<Text color={textColor} wrap="wrap">
								{segment.content}
							</Text>
						</Box>
					);
				})}
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginY={1}>
			<Box>
				{prefix && (
					<Text color={textColor} bold>
						{prefix}{' '}
					</Text>
				)}
				<Text color={textColor} wrap="wrap">
					{content}
					{isStreaming && <Text color="gray">▌</Text>}
				</Text>
			</Box>
		</Box>
	);
}

export interface MessageListProps {
	/** Array of messages to display */
	messages: Array<{
		id: string;
		role: 'user' | 'assistant';
		content: string;
	}>;
	/** Content currently being streamed */
	streamingContent?: string;
}

/**
 * Renders a list of conversation messages
 * Uses Static for completed messages to prevent duplication in terminal buffer
 */
export function MessageList({ messages, streamingContent }: MessageListProps) {
	// Don't show streaming content if it's already been added to messages
	// This prevents duplication during the state transition
	const lastMessage = messages[messages.length - 1];
	const showStreaming = streamingContent &&
		!(lastMessage?.role === 'assistant' && lastMessage.content === streamingContent);

	return (
		<Box flexDirection="column">
			<Static items={messages}>
				{(message) => (
					<Message key={message.id} role={message.role} content={message.content} />
				)}
			</Static>
			{showStreaming && (
				<Message role="assistant" content={streamingContent} isStreaming />
			)}
		</Box>
	);
}

export interface SystemMessageProps {
	/** Message content */
	content: string;
	/** Message type */
	type?: 'info' | 'warning' | 'success';
}

/**
 * Renders a system message (not from user or assistant)
 */
export function SystemMessage({ content, type = 'info' }: SystemMessageProps) {
	const colors = {
		info: 'blue',
		warning: 'yellow',
		success: 'green',
	};

	const icons = {
		info: 'i',
		warning: '!',
		success: '✓',
	};

	return (
		<Box marginY={1}>
			<Text color={colors[type]} bold>
				[{icons[type]}]
			</Text>
			<Text color={colors[type]}> {content}</Text>
		</Box>
	);
}

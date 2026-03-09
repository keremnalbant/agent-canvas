import { AgentMessage, AgentMessageContent } from '../../shared/types/AgentMessage'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { getPromptPartDefinition, PromptPart } from '../../shared/types/PromptPart'

/**
 * Content block types for the Anthropic Messages API.
 */
type TextBlock = { type: 'text'; text: string }
type ImageBlock = {
	type: 'image'
	source: { type: 'base64'; media_type: string; data: string }
}
type ContentBlock = TextBlock | ImageBlock

/**
 * Message format for the Anthropic Messages API (used by Agent SDK).
 */
export interface AnthropicMessage {
	role: 'user' | 'assistant'
	content: string | ContentBlock[]
}

/**
 * Build messages from an AgentPrompt in Anthropic Messages API format.
 */
export function buildMessages(prompt: AgentPrompt): AnthropicMessage[] {
	const allMessages: AgentMessage[] = []

	for (const part of Object.values(prompt)) {
		const messages = buildMessagesFromPart(part as PromptPart)
		allMessages.push(...messages)
	}

	allMessages.sort((a, b) => a.priority - b.priority)

	return toAnthropicMessages(allMessages)
}

function buildMessagesFromPart(part: PromptPart): AgentMessage[] {
	const definition = getPromptPartDefinition(part.type)

	if (definition.buildMessages) {
		return definition.buildMessages(part)
	}

	return defaultBuildMessagesFromPart(part)
}

function defaultBuildMessagesFromPart(part: PromptPart): AgentMessage[] {
	const definition = getPromptPartDefinition(part.type)

	const content = definition.buildContent ? definition.buildContent(part) : []

	if (!content || content.length === 0) {
		return []
	}

	const messageContent: AgentMessageContent[] = []
	for (const item of content) {
		if (typeof item === 'string' && item.startsWith('data:image/')) {
			messageContent.push({
				type: 'image',
				image: item,
			})
		} else {
			messageContent.push({
				type: 'text',
				text: item,
			})
		}
	}

	const priority = definition.priority ?? 0

	return [{ role: 'user', content: messageContent, priority }]
}

/**
 * Parse a data URL into media type and base64 data.
 */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
	if (!match) {
		return { mediaType: 'image/png', data: dataUrl }
	}
	return { mediaType: match[1], data: match[2] }
}

/**
 * Convert AgentMessage[] to Anthropic Messages API format.
 */
function toAnthropicMessages(agentMessages: AgentMessage[]): AnthropicMessage[] {
	return agentMessages.map((msg) => {
		const content: ContentBlock[] = []

		for (const item of msg.content) {
			if (item.type === 'image' && item.image) {
				const { mediaType, data } = parseDataUrl(item.image)
				content.push({
					type: 'image',
					source: {
						type: 'base64',
						media_type: mediaType,
						data,
					},
				})
			} else if (item.text) {
				content.push({
					type: 'text',
					text: item.text,
				})
			}
		}

		return {
			role: msg.role,
			content,
		}
	})
}

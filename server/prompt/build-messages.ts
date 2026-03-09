import Anthropic from '@anthropic-ai/sdk'
import { AgentMessage, AgentMessageContent } from '../../shared/types/AgentMessage'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { getPromptPartDefinition, PromptPart } from '../../shared/types/PromptPart'

/**
 * Content block types for the Anthropic Messages API.
 */
type TextBlock = { type: 'text'; text: string }
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
type ImageBlock = {
	type: 'image'
	source: { type: 'base64'; media_type: ImageMediaType; data: string }
}
type ContentBlock = TextBlock | ImageBlock

/**
 * Build messages from an AgentPrompt in Anthropic Messages API format.
 */
export function buildMessages(prompt: AgentPrompt): Anthropic.MessageParam[] {
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
 *
 * Preserves original user/assistant roles. Consecutive messages with the
 * same role are merged to satisfy the API's alternating-role requirement.
 */
function toAnthropicMessages(agentMessages: AgentMessage[]): Anthropic.MessageParam[] {
	const messages: Anthropic.MessageParam[] = []

	for (const msg of agentMessages) {
		const content: ContentBlock[] = []

		for (const item of msg.content) {
			if (item.type === 'image' && item.image) {
				const { mediaType, data } = parseDataUrl(item.image)
				content.push({
					type: 'image',
					source: {
						type: 'base64',
						media_type: mediaType as ImageMediaType,
						data,
					},
				})
			} else if (item.text) {
				content.push({ type: 'text', text: item.text })
			}
		}

		if (content.length === 0) continue

		const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user'

		// Merge consecutive messages with the same role
		const lastMessage = messages[messages.length - 1]
		if (lastMessage && lastMessage.role === role) {
			const lastContent = Array.isArray(lastMessage.content)
				? lastMessage.content
				: [{ type: 'text' as const, text: lastMessage.content }]
			lastMessage.content = [...lastContent, ...content]
		} else {
			messages.push({ role, content })
		}
	}

	// Anthropic API requires the first message to be from the user
	if (messages.length > 0 && messages[0].role === 'assistant') {
		messages.unshift({ role: 'user', content: '[conversation history follows]' })
	}

	return messages
}

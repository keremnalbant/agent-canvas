import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { getSystemPromptFlags } from './get-system-prompt-flags'
import { buildIntroPromptSection } from './sections/intro-section'
import { buildRulesPromptSection } from './sections/rules-section'

/**
 * Build the system prompt for the agent.
 *
 * This is the main instruction set that tells the AI how to behave.
 * The prompt is constructed from modular sections that adapt based on
 * what actions and parts are available.
 *
 * Note: Unlike the old worker version, this does NOT include a JSON schema
 * section. Tool schemas are carried by the MCP tools themselves.
 */
export function buildSystemPrompt(prompt: AgentPrompt): string {
	const modePart = prompt.mode
	if (!modePart) {
		throw new Error('A mode part is always required.')
	}

	const { actionTypes, partTypes } = modePart
	const flags = getSystemPromptFlags(actionTypes, partTypes)

	const lines = [buildIntroPromptSection(flags), buildRulesPromptSection(flags)]

	return normalizeNewlines(lines.join('\n'))
}

function normalizeNewlines(text: string): string {
	return text.replace(/\n{3,}/g, '\n\n')
}

import { FormEventHandler, useCallback, useRef } from 'react'
import { useValue } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const isPlanComplete = useValue('planComplete', () => agent.mode.getPlanComplete(), [agent])

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!inputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			// If the user's message is empty, just cancel the current request (if there is one)
			if (value === '') {
				agent.cancel()
				return
			}

			// Clear the chat input (context is cleared after it's captured in requestAgentActions)
			inputRef.current.value = ''

			// Sending a new message to the agent should interrupt the current request
			agent.interrupt({
				input: {
					agentMessages: [value],
					userMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent]
	)

	const handleCompileScene = useCallback(() => {
		// Reset planComplete so the button hides while compiling
		agent.mode.setPlanComplete(false)

		// Enter planning mode (for compile_scene tool access) and send compile request
		agent.interrupt({
			input: {
				agentMessages: [
					'The user has finished arranging the subjects on the canvas and wants to compile them into a final coherent image. Use the compile_scene tool with a detailed prompt describing the full scene. Capture the entire canvas arrangement.',
				],
				bounds: agent.editor.getViewportPageBounds(),
				source: 'user',
			},
			mode: 'planning',
		})
	}, [agent])

	const handleNewChat = useCallback(() => {
		agent.reset()
	}, [agent])

	const handlePlanModeToggle = useCallback(() => {
		// Plan mode can only be toggled while idling
		if (agent.mode.getCurrentModeType() !== 'idling') return

		if (agent.mode.getPlanComplete()) {
			// Toggling off while plan is complete clears the plan state
			agent.mode.setPlanComplete(false)
			agent.mode.setPendingPlanMode(false)
		} else {
			// Toggle pending plan mode for next prompt
			agent.mode.setPendingPlanMode(!agent.mode.getPendingPlanMode())
		}
	}, [agent])

	// Show plan mode toggle as active if in planning mode, pending, or plan complete
	const isPlanModeToggleActive = useValue(
		'planModeToggle',
		() => {
			if (agent.mode.getPlanComplete()) return true
			const mode = agent.mode.getCurrentModeType()
			if (mode === 'planning') return true
			if (mode === 'idling') return agent.mode.getPendingPlanMode()
			return false
		},
		[agent]
	)

	return (
		<div className="chat-panel tl-theme__dark">
			<div className="chat-header">
				<button className="new-chat-button" onClick={handleNewChat}>
					+
				</button>
			</div>
			<ChatHistory agent={agent} />
			<div className="chat-input-container">
				<TodoList agent={agent} />
				{isPlanComplete && (
					<button className="compile-scene-button" onClick={handleCompileScene}>
						Compile Scene
					</button>
				)}
				<ChatInput
					handleSubmit={handleSubmit}
					inputRef={inputRef}
					isPlanMode={isPlanModeToggleActive}
					onPlanModeToggle={handlePlanModeToggle}
				/>
			</div>
		</div>
	)
}

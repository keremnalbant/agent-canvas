import { FormEventHandler, useCallback, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { TodoList } from './TodoList'

const PLAN_MODE_PREFIX =
	'[PLAN MODE ACTIVE] Decompose this scene into individual subjects with transparent backgrounds and a separate background. Generate each element separately so the user can arrange them before compiling. '

export function ChatPanel() {
	const agent = useAgent()
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [isPlanMode, setIsPlanMode] = useState(false)
	const isGenerating = useValue('isGenerating', () => agent.requests.isGenerating(), [agent])

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

			// In plan mode, prefix the agent message with plan mode instructions
			const agentMessage = isPlanMode ? PLAN_MODE_PREFIX + value : value

			// Sending a new message to the agent should interrupt the current request
			agent.interrupt({
				input: {
					agentMessages: [agentMessage],
					userMessages: [value],
					bounds: agent.editor.getViewportPageBounds(),
					source: 'user',
					contextItems: agent.context.getItems(),
				},
			})
		},
		[agent, isPlanMode]
	)

	const handleCompileScene = useCallback(() => {
		agent.interrupt({
			input: {
				agentMessages: [
					'The user has finished arranging the subjects on the canvas and wants to compile them into a final coherent image. Use the compile_scene tool with a detailed prompt describing the full scene. Capture the entire canvas arrangement.',
				],
				bounds: agent.editor.getViewportPageBounds(),
				source: 'user',
			},
		})
	}, [agent])

	const handleNewChat = useCallback(() => {
		agent.reset()
		setIsPlanMode(false)
	}, [agent])

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
				{isPlanMode && !isGenerating && (
					<button className="compile-scene-button" onClick={handleCompileScene}>
						Compile Scene
					</button>
				)}
				<ChatInput
					handleSubmit={handleSubmit}
					inputRef={inputRef}
					isPlanMode={isPlanMode}
					onPlanModeToggle={() => setIsPlanMode((prev) => !prev)}
				/>
			</div>
		</div>
	)
}

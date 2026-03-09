import { AgentPrompt } from '../../../shared/types/AgentPrompt'
import { streamAgentActions } from '../../../server/agent-service'
import { ActionChannel } from '../../../server/tools/action-channel'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
	const prompt = (await request.json()) as AgentPrompt

	const channel = new ActionChannel()
	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		async start(controller) {
			// Start the agent in the background - it pushes actions to the channel
			const agentPromise = streamAgentActions(prompt, channel, request.signal).catch(
				(error: Error) => {
					const errorData = `data: ${JSON.stringify({ error: error.message })}\n\n`
					try {
						controller.enqueue(encoder.encode(errorData))
					} catch {
						// Controller may already be closed
					}
				}
			)

			try {
				// Read actions from the channel and send as SSE
				for await (const action of channel) {
					const data = `data: ${JSON.stringify(action)}\n\n`
					controller.enqueue(encoder.encode(data))
				}
			} catch (error: any) {
				const errorData = `data: ${JSON.stringify({ error: error.message })}\n\n`
				try {
					controller.enqueue(encoder.encode(errorData))
				} catch {
					// Controller may already be closed
				}
			}

			// Wait for the agent to finish before closing the stream
			await agentPromise
			controller.close()
		},
	})

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	})
}

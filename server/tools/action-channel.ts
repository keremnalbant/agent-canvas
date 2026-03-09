import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'

/**
 * An async channel for streaming actions from MCP tool handlers to the SSE response.
 * Tool handlers push actions into the channel, and the API route reads from it.
 */
export class ActionChannel {
	private queue: Array<Streaming<AgentAction>> = []
	private waiters: Array<{
		resolve: (value: IteratorResult<Streaming<AgentAction>>) => void
	}> = []
	private closed = false

	push(action: Streaming<AgentAction>) {
		if (this.closed) return

		if (this.waiters.length > 0) {
			const waiter = this.waiters.shift()!
			waiter.resolve({ value: action, done: false })
		} else {
			this.queue.push(action)
		}
	}

	close() {
		this.closed = true
		for (const waiter of this.waiters) {
			waiter.resolve({ value: undefined as any, done: true })
		}
		this.waiters = []
	}

	[Symbol.asyncIterator](): AsyncIterator<Streaming<AgentAction>> {
		return {
			next: (): Promise<IteratorResult<Streaming<AgentAction>>> => {
				if (this.queue.length > 0) {
					return Promise.resolve({ value: this.queue.shift()!, done: false })
				}

				if (this.closed) {
					return Promise.resolve({ value: undefined as any, done: true })
				}

				return new Promise((resolve) => {
					this.waiters.push({ resolve })
				})
			},
		}
	}
}

import { WaitAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const WaitActionUtil = registerActionUtil(
	class WaitActionUtil extends AgentActionUtil<WaitAction> {
		static override type = 'wait' as const

		override getInfo(action: Streaming<WaitAction>) {
			if (!action.complete) {
				return {
					icon: 'pencil' as const,
					description: `Waiting ${action.seconds ?? '...'}s`,
				}
			}
			return {
				icon: 'pencil' as const,
				description: `Waited ${action.seconds}s`,
			}
		}

		override applyAction(_action: Streaming<WaitAction>) {
			// No-op on the client side — the actual wait happens server-side
		}

		override savesToHistory(): boolean {
			return true
		}
	}
)

import { EnterPlanModeAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const EnterPlanModeActionUtil = registerActionUtil(
	class EnterPlanModeActionUtil extends AgentActionUtil<EnterPlanModeAction> {
		static override type = 'enter-plan-mode' as const

		override getInfo(action: Streaming<EnterPlanModeAction>) {
			return {
				icon: 'pencil' as const,
				description: `**Entering plan mode:** ${action.intent ?? ''}`,
			}
		}

		override applyAction(action: Streaming<EnterPlanModeAction>) {
			if (!action.complete) return
			this.agent.mode.setMode('planning')
		}
	}
)

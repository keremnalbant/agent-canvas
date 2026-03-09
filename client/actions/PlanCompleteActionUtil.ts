import { PlanCompleteAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const PlanCompleteActionUtil = registerActionUtil(
	class PlanCompleteActionUtil extends AgentActionUtil<PlanCompleteAction> {
		static override type = 'plan-complete' as const

		override getInfo(action: Streaming<PlanCompleteAction>) {
			return {
				icon: 'pencil' as const,
				description: `**Plan complete:** ${action.summary ?? ''}`,
			}
		}

		override applyAction(action: Streaming<PlanCompleteAction>) {
			if (!action.complete) return
			this.agent.mode.setPlanComplete(true)
		}
	}
)

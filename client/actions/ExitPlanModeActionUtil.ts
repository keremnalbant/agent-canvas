import { ExitPlanModeAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const ExitPlanModeActionUtil = registerActionUtil(
	class ExitPlanModeActionUtil extends AgentActionUtil<ExitPlanModeAction> {
		static override type = 'exit-plan-mode' as const

		override getInfo() {
			return {
				icon: 'pencil' as const,
				description: '**Exiting plan mode**',
			}
		}

		override applyAction(action: Streaming<ExitPlanModeAction>) {
			if (!action.complete) return
			this.agent.mode.setMode('idling')
		}
	}
)

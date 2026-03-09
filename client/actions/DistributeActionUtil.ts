import { TLShapeId } from 'tldraw'
import { DistributeAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const DistributeActionUtil = registerActionUtil(
	class DistributeActionUtil extends AgentActionUtil<DistributeAction> {
		static override type = 'distribute' as const

		override getInfo(action: Streaming<DistributeAction>) {
			const lines: string[] = []
			if (action.intent) lines.push(`**Intent:** ${action.intent}`)
			if (action.direction) lines.push(`**Direction:** ${action.direction}`)
			if (action.shapeIds?.length) lines.push(`**Shapes:** ${action.shapeIds.join(', ')}`)
			return {
				icon: 'cursor' as const,
				description: lines.join('\n\n') || 'Distributing shapes...',
			}
		}

		override sanitizeAction(action: Streaming<DistributeAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<DistributeAction>) {
			if (!action.complete) return

			this.editor.distributeShapes(
				action.shapeIds.map((id) => `shape:${id}` as TLShapeId),
				action.direction
			)
		}
	}
)

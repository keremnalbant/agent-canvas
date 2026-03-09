import { TLShapeId } from 'tldraw'
import { BringToFrontAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const BringToFrontActionUtil = registerActionUtil(
	class BringToFrontActionUtil extends AgentActionUtil<BringToFrontAction> {
		static override type = 'bringToFront' as const

		override getInfo(action: Streaming<BringToFrontAction>) {
			const lines: string[] = []
			if (action.intent) lines.push(`**Intent:** ${action.intent}`)
			if (action.shapeIds?.length) lines.push(`**Shapes:** ${action.shapeIds.join(', ')}`)
			return {
				icon: 'cursor' as const,
				description: lines.join('\n\n') || 'Bringing to front...',
			}
		}

		override sanitizeAction(action: Streaming<BringToFrontAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<BringToFrontAction>) {
			if (!action.shapeIds) return
			this.editor.bringToFront(action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId))
		}
	}
)

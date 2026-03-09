import { TLShapeId } from 'tldraw'
import { RotateAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const RotateActionUtil = registerActionUtil(
	class RotateActionUtil extends AgentActionUtil<RotateAction> {
		static override type = 'rotate' as const

		override getInfo(action: Streaming<RotateAction>) {
			const lines: string[] = []
			if (action.intent) lines.push(`**Intent:** ${action.intent}`)
			if (action.degrees !== undefined) lines.push(`**Degrees:** ${action.degrees}`)
			if (action.originX !== undefined && action.originY !== undefined) {
				lines.push(`**Origin:** (${action.originX}, ${action.originY})`)
			}
			if (action.shapeIds?.length) lines.push(`**Shapes:** ${action.shapeIds.join(', ')}`)
			return {
				icon: 'cursor' as const,
				description: lines.join('\n\n') || 'Rotating shapes...',
			}
		}

		override sanitizeAction(action: Streaming<RotateAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<RotateAction>, helpers: AgentHelpers) {
			if (!action.shapeIds || !action.degrees || !action.originX || !action.originY) {
				return
			}

			const origin = helpers.removeOffsetFromVec({ x: action.originX, y: action.originY })
			const shapeIds = action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId)
			const radians = (action.degrees * Math.PI) / 180

			this.editor.rotateShapesBy(shapeIds, radians, { center: origin })
		}
	}
)

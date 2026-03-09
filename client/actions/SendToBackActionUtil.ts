import { TLShapeId } from 'tldraw'
import { SendToBackAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const SendToBackActionUtil = registerActionUtil(
	class SendToBackActionUtil extends AgentActionUtil<SendToBackAction> {
		static override type = 'sendToBack' as const

		override getInfo(action: Streaming<SendToBackAction>) {
			const lines: string[] = []
			if (action.intent) lines.push(`**Intent:** ${action.intent}`)
			if (action.shapeIds?.length) lines.push(`**Shapes:** ${action.shapeIds.join(', ')}`)
			return {
				icon: 'cursor' as const,
				description: lines.join('\n\n') || 'Sending to back...',
			}
		}

		override sanitizeAction(action: Streaming<SendToBackAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<SendToBackAction>) {
			if (!action.shapeIds) return
			this.editor.sendToBack(action.shapeIds.map((shapeId) => `shape:${shapeId}` as TLShapeId))
		}
	}
)

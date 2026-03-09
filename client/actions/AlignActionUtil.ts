import { TLShapeId } from 'tldraw'
import { AlignAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const AlignActionUtil = registerActionUtil(
	class AlignActionUtil extends AgentActionUtil<AlignAction> {
		static override type = 'align' as const

		override getInfo(action: Streaming<AlignAction>) {
			const lines: string[] = []
			if (action.intent) lines.push(`**Intent:** ${action.intent}`)
			if (action.alignment) lines.push(`**Alignment:** ${action.alignment}`)
			if (action.gap !== undefined) lines.push(`**Gap:** ${action.gap}`)
			if (action.shapeIds?.length) lines.push(`**Shapes:** ${action.shapeIds.join(', ')}`)
			return {
				icon: 'cursor' as const,
				description: lines.join('\n\n') || 'Aligning shapes...',
			}
		}

		override sanitizeAction(action: Streaming<AlignAction>, helpers: AgentHelpers) {
			action.shapeIds = helpers.ensureShapeIdsExist(action.shapeIds ?? [])
			return action
		}

		override applyAction(action: Streaming<AlignAction>) {
			if (!action.complete) return

			this.editor.alignShapes(
				action.shapeIds.map((id) => `shape:${id}` as TLShapeId),
				action.alignment
			)
		}
	}
)

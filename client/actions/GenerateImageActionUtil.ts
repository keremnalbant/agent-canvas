import { AssetRecordType, createShapeId } from 'tldraw'
import { GenerateImageAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

export const GenerateImageActionUtil = registerActionUtil(
	class GenerateImageActionUtil extends AgentActionUtil<GenerateImageAction> {
		static override type = 'generate-image' as const

		override getInfo(action: Streaming<GenerateImageAction>) {
			if (!action.complete) {
				const lines = [action.transparent ? 'Generating transparent image...' : 'Generating image...']
				if (action.prompt) lines.push(`**Prompt:** ${action.prompt}`)
				if (action.x !== undefined && action.y !== undefined) {
					lines.push(`**Position:** (${action.x}, ${action.y})`)
				}
				if (action.width || action.height) {
					lines.push(`**Size:** ${action.width ?? 1024}x${action.height ?? 1024}`)
				}
				if (action.seed !== undefined) lines.push(`**Seed:** ${action.seed}`)
				if (action.transparent) lines.push(`**Transparent:** yes`)
				return { icon: 'pencil' as const, description: lines.join('\n\n') }
			}

			const lines = [action.transparent ? 'Generated transparent image' : 'Generated image']
			lines.push(`**Prompt:** ${action.prompt}`)
			lines.push(`**Position:** (${action.x}, ${action.y})`)
			lines.push(`**Size:** ${action.width ?? 1024}x${action.height ?? 1024}`)
			if (action.seed !== undefined) lines.push(`**Seed:** ${action.seed}`)
			if (action.transparent) lines.push(`**Transparent:** yes`)
			if (action.intent) lines.push(`**Intent:** ${action.intent}`)
			return {
				icon: 'pencil' as const,
				description: lines.join('\n\n'),
				summary: `Generated image: "${action.prompt.slice(0, 60)}${action.prompt.length > 60 ? '...' : ''}"`,
			}
		}

		override async applyAction(action: Streaming<GenerateImageAction>, helpers: AgentHelpers) {
			if (!action.complete) return

			const actionWithImage = action as Streaming<GenerateImageAction> & {
				imageUrl?: string
				imageError?: string
			}

			if (!actionWithImage.imageUrl) {
				// Error is already communicated to the model via the tool result
				return
			}

			const w = action.width ?? 1024
			const h = action.height ?? 1024

			const position = helpers.removeOffsetFromVec({
				x: action.x,
				y: action.y,
			})

			const assetId = AssetRecordType.createId()
			this.editor.createAssets([
				AssetRecordType.create({
					id: assetId,
					type: 'image',
					props: {
						src: actionWithImage.imageUrl,
						w,
						h,
						mimeType: 'image/png',
						name: 'generated-image.png',
						isAnimated: false,
					},
				}),
			])

			this.editor.createShape({
				id: createShapeId(),
				type: 'image',
				x: position.x,
				y: position.y,
				props: {
					assetId,
					w,
					h,
				},
			})

			// No schedule() needed: the tool result is already fed back
			// to the model in the server-side tool loop.
		}
	}
)

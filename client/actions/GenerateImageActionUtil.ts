import { AssetRecordType, createShapeId } from 'tldraw'
import { GenerateImageAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

interface GenerateImageResponse {
	success: boolean
	imageUrl?: string
	width?: number
	height?: number
	error?: string
}

export const GenerateImageActionUtil = registerActionUtil(
	class GenerateImageActionUtil extends AgentActionUtil<GenerateImageAction> {
		static override type = 'generate-image' as const

		override getInfo(action: Streaming<GenerateImageAction>) {
			const description = action.complete ? 'Generated image' : 'Generating image...'
			return {
				icon: 'pencil' as const,
				description,
			}
		}

		override async applyAction(action: Streaming<GenerateImageAction>, helpers: AgentHelpers) {
			if (!action.complete) return

			const w = action.width ?? 1024
			const h = action.height ?? 1024

			const response = await fetch('/api/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: action.prompt,
					width: w,
					height: h,
					seed: action.seed,
				}),
			})

			const result = (await response.json()) as GenerateImageResponse

			if (!result.success || !result.imageUrl) {
				this.agent.schedule({
					data: [`Image generation failed: ${result.error ?? 'Unknown error'}`],
				})
				return
			}

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
						src: result.imageUrl,
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

			this.agent.schedule({
				data: [
					`Image generated successfully and placed on the canvas at (${action.x}, ${action.y}) with dimensions ${w}x${h}.`,
				],
			})
		}
	}
)

import { AssetRecordType, createShapeId, FileHelpers } from 'tldraw'
import { CompileSceneAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

interface CompileResult {
	success: boolean
	imageUrl?: string
	width?: number
	height?: number
	error?: string
}

export const CompileSceneActionUtil = registerActionUtil(
	class CompileSceneActionUtil extends AgentActionUtil<CompileSceneAction> {
		static override type = 'compile-scene' as const

		override getInfo(action: Streaming<CompileSceneAction>) {
			if (!action.complete) {
				const lines = ['Compiling scene...']
				if (action.prompt) lines.push(`**Prompt:** ${action.prompt}`)
				if (action.x !== undefined && action.y !== undefined) {
					lines.push(`**Position:** (${action.x}, ${action.y})`)
				}
				if (action.width || action.height) {
					lines.push(`**Size:** ${action.width ?? 1024}x${action.height ?? 1024}`)
				}
				return { icon: 'pencil' as const, description: lines.join('\n\n') }
			}

			const lines = ['Compiled scene']
			lines.push(`**Prompt:** ${action.prompt}`)
			lines.push(`**Position:** (${action.x}, ${action.y})`)
			lines.push(`**Size:** ${action.width ?? 1024}x${action.height ?? 1024}`)
			if (action.intent) lines.push(`**Intent:** ${action.intent}`)
			return {
				icon: 'pencil' as const,
				description: lines.join('\n\n'),
				summary: `Compiled scene: "${action.prompt.slice(0, 60)}${action.prompt.length > 60 ? '...' : ''}"`,
			}
		}

		override async applyAction(action: Streaming<CompileSceneAction>, helpers: AgentHelpers) {
			if (!action.complete) return

			const actionWithImage = action as Streaming<CompileSceneAction> & {
				imageUrl?: string
				imageError?: string
			}

			// If the server already generated the image (had screenshotDataUrl), use it directly
			if (actionWithImage.imageUrl) {
				this.placeImage(actionWithImage.imageUrl, action, helpers)
				return
			}

			// Otherwise, capture canvas screenshot and call /api/compile-scene
			const screenshot = await this.captureCanvasScreenshot(action)
			if (!screenshot) {
				this.agent.schedule({
					data: ['Scene compilation failed: Could not capture canvas screenshot.'],
				})
				return
			}

			// Enhance the prompt with blending instructions for BFL
			const blendingPrompt = [
				action.prompt,
				'Seamlessly blend and harmonize all elements into a single cohesive photorealistic image.',
				'Unify lighting, shadows, color grading, and atmosphere across all elements.',
				'Add natural shadows and reflections where objects meet surfaces.',
				'Smooth all edges so no element looks cut-and-pasted.',
				'Match perspective, depth of field, and visual style consistently throughout.',
			].join('. ')

			const response = await fetch('/api/compile-scene', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: blendingPrompt,
					input_image: screenshot,
					width: action.width ?? 1024,
					height: action.height ?? 1024,
				}),
			})

			const result = (await response.json()) as CompileResult

			if (!result.success || !result.imageUrl) {
				this.agent.schedule({
					data: [`Scene compilation failed: ${result.error ?? 'Unknown error'}`],
				})
				return
			}

			this.placeImage(result.imageUrl, action, helpers)
		}

		private placeImage(
			imageUrl: string,
			action: Streaming<CompileSceneAction>,
			helpers: AgentHelpers
		) {
			const w = action.width ?? 1024
			const h = action.height ?? 1024

			const position = helpers.removeOffsetFromVec({
				x: action.x ?? 0,
				y: action.y ?? 0,
			})

			const assetId = AssetRecordType.createId()
			this.editor.createAssets([
				AssetRecordType.create({
					id: assetId,
					type: 'image',
					props: {
						src: imageUrl,
						w,
						h,
						mimeType: 'image/png',
						name: 'compiled-scene.png',
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
		}

		private async captureCanvasScreenshot(
			_action: Streaming<CompileSceneAction>
		): Promise<string | null> {
			try {
				const shapes = this.editor.getCurrentPageShapes()
				if (shapes.length === 0) return null

				const result = await this.editor.toImage(shapes, {
					format: 'png',
					background: true,
					pixelRatio: 1,
				})
				if (!result?.blob) return null

				return await FileHelpers.blobToDataUrl(result.blob)
			} catch {
				return null
			}
		}
	}
)

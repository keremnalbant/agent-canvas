import { Box, FileHelpers } from 'tldraw'
import { ScreenshotPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentRequest } from '../../shared/types/AgentRequest'
import { PromptPartUtil, registerPromptPartUtil } from './PromptPartUtil'

// Anthropic API limit is 5MB for base64 images. Use 4.5MB as target
// to leave headroom for base64 encoding overhead (~33%).
const MAX_IMAGE_BYTES = 4_500_000

export const ScreenshotPartUtil = registerPromptPartUtil(
	class ScreenshotPartUtil extends PromptPartUtil<ScreenshotPart> {
		static override type = 'screenshot' as const

		override async getPart(request: AgentRequest): Promise<ScreenshotPart> {
			const { editor } = this

			const contextBounds = request.bounds
			const contextBoundsBox = Box.From(contextBounds)

			const shapes = editor.getCurrentPageShapesSorted().filter((shape) => {
				const bounds = editor.getShapeMaskedPageBounds(shape)
				if (!bounds) return false
				return contextBoundsBox.includes(bounds)
			})

			if (shapes.length === 0) {
				return { type: 'screenshot', screenshot: '' }
			}

			const largestDimension = Math.max(request.bounds.w, request.bounds.h)
			const baseScale = largestDimension > 8000 ? 8000 / largestDimension : 1
			const bounds = Box.From(request.bounds)

			// Try capturing at full scale, then progressively reduce if too large
			let scale = baseScale
			for (let attempt = 0; attempt < 4; attempt++) {
				const result = await editor.toImage(shapes, {
					format: 'jpeg',
					background: true,
					bounds,
					padding: 0,
					pixelRatio: 1,
					scale,
				})

				if (result.blob.size <= MAX_IMAGE_BYTES) {
					return {
						type: 'screenshot',
						screenshot: await FileHelpers.blobToDataUrl(result.blob),
					}
				}

				// Scale down by sqrt of the overshoot ratio for faster convergence
				const ratio = MAX_IMAGE_BYTES / result.blob.size
				scale = scale * Math.sqrt(ratio)
			}

			// Final attempt at minimum scale
			const result = await editor.toImage(shapes, {
				format: 'jpeg',
				background: true,
				bounds,
				padding: 0,
				pixelRatio: 1,
				scale: Math.min(scale, 0.25),
			})

			return {
				type: 'screenshot',
				screenshot: await FileHelpers.blobToDataUrl(result.blob),
			}
		}
	}
)

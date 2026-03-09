import { AssetRecordType, createShapeId, TLAssetId, TLShape, TLShapeId } from 'tldraw'
import { EditImageAction } from '../../shared/schema/AgentActionSchemas'
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

function resolveImageSrc(
	editor: { getShape: (id: TLShapeId) => TLShape | undefined; getAsset: (id: TLAssetId) => any },
	simpleShapeId: string
): string | null {
	const shapeId = `shape:${simpleShapeId}` as TLShapeId
	const shape = editor.getShape(shapeId)
	if (!shape || shape.type !== 'image') return null

	const props = shape.props as { assetId?: TLAssetId }
	if (!props.assetId) return null

	const asset = editor.getAsset(props.assetId)
	if (!asset || asset.type !== 'image') return null

	return (asset.props as { src?: string }).src ?? null
}

export const EditImageActionUtil = registerActionUtil(
	class EditImageActionUtil extends AgentActionUtil<EditImageAction> {
		static override type = 'edit-image' as const

		override getInfo(action: Streaming<EditImageAction>) {
			const description = action.complete ? 'Edited image' : 'Editing image...'
			return {
				icon: 'pencil' as const,
				description,
			}
		}

		override sanitizeAction(action: Streaming<EditImageAction>, helpers: AgentHelpers) {
			if (!action.complete) return action

			const validatedId = helpers.ensureShapeIdExists(action.input_image)
			if (!validatedId) return null

			return {
				...action,
				input_image: validatedId,
			}
		}

		override async applyAction(action: Streaming<EditImageAction>, helpers: AgentHelpers) {
			if (!action.complete) return

			// Resolve input images from shape IDs to actual image data
			const inputImageSrc = resolveImageSrc(this.editor, action.input_image)
			if (!inputImageSrc) {
				this.agent.schedule({
					data: [
						`Image editing failed: Could not find image data for shape ${action.input_image}. Make sure the shape is an image.`,
					],
				})
				return
			}

			const requestBody: Record<string, unknown> = {
				prompt: action.prompt,
				input_image: inputImageSrc,
				width: action.width,
				height: action.height,
				seed: action.seed,
			}

			// Resolve additional reference images
			const additionalRefs = [
				action.input_image_2,
				action.input_image_3,
				action.input_image_4,
				action.input_image_5,
				action.input_image_6,
				action.input_image_7,
				action.input_image_8,
			]
			additionalRefs.forEach((refId, index) => {
				if (refId) {
					const src = resolveImageSrc(this.editor, refId)
					if (src) {
						requestBody[`input_image_${index + 2}`] = src
					}
				}
			})

			const response = await fetch('/api/generate-image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			})

			const result = (await response.json()) as GenerateImageResponse

			if (!result.success || !result.imageUrl) {
				this.agent.schedule({
					data: [`Image editing failed: ${result.error ?? 'Unknown error'}`],
				})
				return
			}

			// Get the original image shape's bounds for positioning
			const originalShapeId = `shape:${action.input_image}` as TLShapeId
			const originalShape = this.editor.getShape(originalShapeId)
			const originalBounds = originalShape
				? this.editor.getShapePageBounds(originalShape)
				: null

			const w = result.width ?? action.width ?? 1024
			const h = result.height ?? action.height ?? 1024

			// Position: use explicit x/y if provided, otherwise place next to original
			let posX: number
			let posY: number

			if (action.x !== undefined && action.y !== undefined) {
				const position = helpers.removeOffsetFromVec({ x: action.x, y: action.y })
				posX = position.x
				posY = position.y
			} else if (originalBounds) {
				posX = originalBounds.x + originalBounds.w + 40
				posY = originalBounds.y
			} else {
				const position = helpers.removeOffsetFromVec({ x: 0, y: 0 })
				posX = position.x
				posY = position.y
			}

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
						name: 'edited-image.png',
						isAnimated: false,
					},
				}),
			])

			this.editor.createShape({
				id: createShapeId(),
				type: 'image',
				x: posX,
				y: posY,
				props: {
					assetId,
					w,
					h,
				},
			})

			this.agent.schedule({
				data: [
					`Image edited successfully. The new image has been placed on the canvas next to the original.`,
				],
			})
		}
	}
)

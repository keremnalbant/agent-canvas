import Anthropic from '@anthropic-ai/sdk'
import z from 'zod'
import { AgentAction, getActionSchema } from '../../shared/types/AgentAction'
import { generateImageWithBfl, generateTransparentImageWithBfl } from '../bfl-client'
import { ActionChannel } from './action-channel'

/**
 * Maps action _type values to tool names and descriptions.
 * The tool input schema is derived from the action schema by removing the _type field.
 */
const ACTION_TOOL_MAP: Record<
	string,
	{ toolName: string; description: string }
> = {
	create: {
		toolName: 'create_shape',
		description:
			'Create a new shape on the canvas. Use this for rectangles, ellipses, triangles, text, arrows, notes, and other shape types.',
	},
	update: {
		toolName: 'update_shape',
		description:
			'Update properties of an existing shape (color, fill, size, text alignment, etc). Do NOT use this to move shapes - use move_shape instead.',
	},
	delete: {
		toolName: 'delete_shape',
		description: 'Delete a shape from the canvas by its shapeId.',
	},
	move: {
		toolName: 'move_shape',
		description: 'Move a shape to a new position on the canvas.',
	},
	resize: {
		toolName: 'resize_shapes',
		description:
			'Resize one or more shapes relative to an origin point using scale factors.',
	},
	rotate: {
		toolName: 'rotate_shapes',
		description: 'Rotate one or more shapes around an origin point by a given number of degrees.',
	},
	align: {
		toolName: 'align_shapes',
		description:
			'Align multiple shapes to each other on an axis (top, bottom, left, right, center-horizontal, center-vertical).',
	},
	distribute: {
		toolName: 'distribute_shapes',
		description: 'Distribute multiple shapes evenly horizontally or vertically.',
	},
	stack: {
		toolName: 'stack_shapes',
		description:
			'Stack shapes horizontally or vertically with a specified gap. Note: this does not align shapes, only stacks along one axis.',
	},
	place: {
		toolName: 'place_shape',
		description: 'Place a shape relative to another shape (top, bottom, left, right) with alignment and offset.',
	},
	bringToFront: {
		toolName: 'bring_to_front',
		description: 'Bring one or more shapes to the front so they appear above everything else.',
	},
	sendToBack: {
		toolName: 'send_to_back',
		description: 'Send one or more shapes to the back so they appear behind everything else.',
	},
	label: {
		toolName: 'set_label',
		description: "Change a shape's text label.",
	},
	pen: {
		toolName: 'draw_pen',
		description:
			'Draw a freeform line with a pen. Useful for custom paths not available as standard shapes. Smooth style auto-smooths between points; straight style draws straight segments.',
	},
	clear: {
		toolName: 'clear_canvas',
		description: 'Delete all shapes on the canvas.',
	},
	'generate-image': {
		toolName: 'generate_image',
		description:
			'Generate a new image from a text prompt and place it on the canvas. Specify x and y for placement. Dimensions default to 1024x1024 (must be multiples of 16).',
	},
	'edit-image': {
		toolName: 'edit_image',
		description:
			'Edit an existing image on the canvas using AI. Provide the shapeId of the image to edit as input_image and a prompt describing desired changes. You can reference up to 8 images.',
	},
	message: {
		toolName: 'send_message',
		description: 'Send a text message to the user. Use this to communicate status, ask questions, or provide explanations.',
	},
	think: {
		toolName: 'think',
		description: 'Record your reasoning or planning. This is not visible to the user - use send_message to communicate.',
	},
	count: {
		toolName: 'count_shapes',
		description:
			'Request a count of shapes on the canvas matching an expression. The count result will be provided in a follow-up.',
	},
	countryInfo: {
		toolName: 'get_country_info',
		description: 'Get information about a country by its country code (e.g., "de" for Germany).',
	},
	review: {
		toolName: 'review_canvas',
		description:
			'Schedule a review of a canvas area. Provide x, y, w, h to define the review area. You will see updated canvas state in a follow-up.',
	},
	setMyView: {
		toolName: 'set_view',
		description:
			'Change your viewport bounds to navigate to a different area of the canvas. Provides an updated view.',
	},
	'add-detail': {
		toolName: 'plan_detail',
		description: 'Plan further work to add more detail to what you have done so far.',
	},
	'update-todo-list': {
		toolName: 'update_todo',
		description: 'Create or update a todo list item to track progress.',
	},
	'compile-scene': {
		toolName: 'compile_scene',
		description:
			'Compile arranged transparent-background subjects and background into a final coherent image. Used after plan mode to merge the arranged scene into one image. Provide the original scene prompt and placement coordinates.',
	},
}

/**
 * Reverse mapping: tool name -> action _type
 */
const TOOL_TO_ACTION_TYPE: Record<string, string> = Object.fromEntries(
	Object.entries(ACTION_TOOL_MAP).map(([actionType, { toolName }]) => [toolName, actionType])
)

/**
 * Get the action _type for a given tool name.
 */
export function getActionTypeForTool(toolName: string): string | undefined {
	return TOOL_TO_ACTION_TYPE[toolName]
}

/**
 * Build Anthropic Tool definitions from action schemas.
 * Converts Zod schemas to JSON Schema for the tool input_schema.
 */
export function buildAnthropicTools(actionTypes: AgentAction['_type'][]): Anthropic.Tool[] {
	const tools: Anthropic.Tool[] = []

	for (const actionType of actionTypes) {
		const mapping = ACTION_TOOL_MAP[actionType]
		if (!mapping) continue

		const schema = getActionSchema(actionType)
		if (!schema || !(schema instanceof z.ZodObject)) continue

		// Strip the _type field from the schema
		const rawShape = (schema as z.ZodObject<z.ZodRawShape>).shape
		const inputShape = Object.fromEntries(
			Object.entries(rawShape).filter(([key]) => key !== '_type')
		) as z.ZodRawShape
		const inputSchema = z.object(inputShape)

		// Convert Zod schema to JSON Schema
		const jsonSchema = z.toJSONSchema(inputSchema)

		tools.push({
			name: mapping.toolName,
			description: mapping.description,
			input_schema: jsonSchema as Anthropic.Tool['input_schema'],
		})
	}

	return tools
}

/**
 * Result of a tool execution, returned to the model as tool_result content.
 */
interface ToolExecutionResult {
	text: string
	isError?: boolean
}

/**
 * Execute a canvas tool by name and push the action to the channel.
 *
 * Returns a text result that gets sent back to the model as tool_result.
 */
export async function executeCanvasTool(
	toolName: string,
	input: Record<string, unknown>,
	channel: ActionChannel,
): Promise<ToolExecutionResult> {
	const actionType = TOOL_TO_ACTION_TYPE[toolName]
	if (!actionType) {
		return { text: `Unknown tool: ${toolName}`, isError: true }
	}

	if (actionType === 'generate-image') {
		return executeGenerateImage(actionType, input, channel)
	}

	if (actionType === 'compile-scene') {
		return executeCompileScene(actionType, input, channel)
	}

	// Default handler: push complete action immediately
	channel.push({
		_type: actionType,
		...input,
		complete: true,
		time: 0,
	} as any)

	return { text: `Action "${actionType}" executed successfully.` }
}

async function executeGenerateImage(
	actionType: string,
	input: Record<string, unknown>,
	channel: ActionChannel,
): Promise<ToolExecutionResult> {
	const isTransparent = input.transparent === true
	console.log(`[canvas-tools] generate_image: transparent=${isTransparent}, prompt="${(input.prompt as string)?.slice(0, 80)}"`)

	let result
	try {
		result = isTransparent
			? await generateTransparentImageWithBfl({
					prompt: input.prompt as string,
					width: input.width as number | undefined,
					height: input.height as number | undefined,
					seed: input.seed as number | undefined,
				})
			: await generateImageWithBfl({
					prompt: input.prompt as string,
					width: input.width as number | undefined,
					height: input.height as number | undefined,
					seed: input.seed as number | undefined,
				})
		console.log(`[canvas-tools] generate_image result: success=${result.success}, error=${result.error}`)
	} catch (error) {
		console.error('[canvas-tools] generate_image threw:', error)
		channel.push({
			_type: actionType,
			...input,
			imageError: error instanceof Error ? error.message : String(error),
			complete: true,
			time: 0,
		} as any)
		return { text: `Image generation failed: ${error instanceof Error ? error.message : String(error)}`, isError: true }
	}

	channel.push({
		_type: actionType,
		...input,
		imageUrl: result.success ? result.imageUrl : undefined,
		imageError: result.success ? undefined : result.error,
		complete: true,
		time: 0,
	} as any)

	if (!result.success) {
		return { text: `Image generation failed: ${result.error}` }
	}

	const transparentNote = isTransparent ? ' with transparent background' : ''
	return {
		text: `Image generated successfully${transparentNote} (${result.width}x${result.height}) and placed at (${input.x}, ${input.y}).`,
	}
}

async function executeCompileScene(
	actionType: string,
	input: Record<string, unknown>,
	channel: ActionChannel,
): Promise<ToolExecutionResult> {
	// The screenshotDataUrl will be injected by the client-side action util
	// before this is called. On the server side, we use it as input_image
	// for img2img generation via the standard BFL API.
	const screenshotDataUrl = input.screenshotDataUrl as string | undefined

	if (!screenshotDataUrl) {
		// Push a compile-scene action that the client will handle
		// The client captures the screenshot and calls /api/compile-scene
		channel.push({
			_type: actionType,
			...input,
			complete: true,
			time: 0,
		} as any)

		return {
			text: 'Scene compilation initiated. The client will capture the canvas and generate the final image.',
		}
	}

	const result = await generateImageWithBfl({
		prompt: input.prompt as string,
		input_image: screenshotDataUrl,
		width: input.width as number | undefined,
		height: input.height as number | undefined,
	})

	channel.push({
		_type: actionType,
		...input,
		imageUrl: result.success ? result.imageUrl : undefined,
		imageError: result.success ? undefined : result.error,
		complete: true,
		time: 0,
	} as any)

	if (!result.success) {
		return { text: `Scene compilation failed: ${result.error}` }
	}

	return {
		text: `Scene compiled successfully (${result.width}x${result.height}) and placed at (${input.x}, ${input.y}).`,
	}
}

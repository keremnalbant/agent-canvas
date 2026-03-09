import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import z from 'zod'
import { AgentAction, getActionSchema } from '../../shared/types/AgentAction'
import { ActionChannel } from './action-channel'

/**
 * Maps action _type values to MCP tool names and descriptions.
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
 * Get the list of all tool names for a given set of action types.
 */
export function getToolNamesForActions(actionTypes: AgentAction['_type'][]): string[] {
	return actionTypes
		.map((type) => ACTION_TOOL_MAP[type]?.toolName)
		.filter((name): name is string => name !== undefined)
		.map((name) => `mcp__canvas__${name}`)
}

/**
 * Extract the input schema shape from an action schema, removing the _type field.
 */
function extractToolInputShape(actionType: string): z.ZodRawShape | null {
	const schema = getActionSchema(actionType)
	if (!schema || !(schema instanceof z.ZodObject)) return null

	const rawShape = (schema as z.ZodObject<z.ZodRawShape>).shape
	const inputShape = Object.fromEntries(
		Object.entries(rawShape).filter(([key]) => key !== '_type')
	) as z.ZodRawShape

	return inputShape
}

/**
 * Create the MCP server with canvas tools for a given set of action types.
 */
export function createCanvasToolServer(
	actionTypes: AgentAction['_type'][],
	channel: ActionChannel
) {
	const tools = actionTypes
		.map((actionType) => {
			const mapping = ACTION_TOOL_MAP[actionType]
			if (!mapping) return null

			const inputShape = extractToolInputShape(actionType)
			if (!inputShape) return null

			return tool(
				mapping.toolName,
				mapping.description,
				inputShape,
				async (args: Record<string, unknown>) => {
					const action = {
						_type: actionType,
						...args,
					}

					channel.push({
						...(action as any),
						complete: true,
						time: 0,
					})

					return {
						content: [
							{
								type: 'text' as const,
								text: `Action "${actionType}" executed successfully.`,
							},
						],
					}
				}
			)
		})
		.filter((t): t is NonNullable<typeof t> => t !== null)

	return createSdkMcpServer({
		name: 'canvas',
		version: '1.0.0',
		tools,
	})
}

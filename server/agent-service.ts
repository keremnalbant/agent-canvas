import Anthropic from "@anthropic-ai/sdk";
import type { ModePart } from "../shared/schema/PromptPartDefinitions";
import { AgentPrompt } from "../shared/types/AgentPrompt";
import { buildMessages } from "./prompt/build-messages";
import { buildSystemPrompt } from "./prompt/build-system-prompt";
import { ActionChannel } from "./tools/action-channel";
import {
  buildAnthropicTools,
  executeCanvasTool,
  getActionTypeForTool,
  getToolPhase,
} from "./tools/canvas-tools";

const MAX_TURNS = 300;
const MAX_TOKENS = 16384;

const client = new Anthropic();

/**
 * Stream agent actions using the Anthropic Client SDK with a manual tool loop.
 *
 * Each turn:
 * 1. Stream the model response (text + tool_use blocks)
 * 2. Push text as think/message actions and tool calls as incomplete actions
 * 3. Execute each tool, pushing complete actions and results to the channel
 * 4. Feed tool_result messages back and loop until the model stops calling tools
 */
export async function streamAgentActions(
  prompt: AgentPrompt,
  channel: ActionChannel,
  signal?: AbortSignal,
): Promise<void> {
  const modePart = prompt.mode as ModePart | undefined;
  if (!modePart) {
    throw new Error("A mode part is always required.");
  }

  const { actionTypes } = modePart;

  const systemPrompt = buildSystemPrompt(prompt);
  const initialMessages = buildMessages(prompt);
  const tools = buildAnthropicTools(actionTypes);

  // Accumulate conversation history across turns
  const messages: Anthropic.MessageParam[] = [...initialMessages];

  // Track consecutive turns where ALL tool calls failed, to break infinite retry loops.
  // This is a safety net — normally the agent should use the `wait` tool to back off.
  let consecutiveAllFailTurns = 0;
  const MAX_CONSECUTIVE_FAIL_TURNS = 5;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (signal?.aborted) break;

      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
        tools,
      });

      // Push incomplete actions as tool_use blocks arrive in the stream
      stream.on("contentBlock", (block) => {
        if (block.type === "tool_use") {
          const actionType = getActionTypeForTool(block.name);
          if (actionType) {
            channel.push({
              _type: actionType,
              ...(block.input as Record<string, unknown>),
              complete: false,
              time: 0,
            } as any);
          }
        }
      });

      const response = await stream.finalMessage();

      // Append assistant message to conversation history
      messages.push({ role: "assistant", content: response.content });

      // Push text blocks: as "think" during tool turns, as "message" on final turn
      const isToolTurn = response.stop_reason === "tool_use";
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          channel.push({
            _type: isToolTurn ? "think" : "message",
            text: block.text,
            complete: true,
            time: 0,
          } as any);
        }
      }

      if (!isToolTurn) break;

      // Split tool_use blocks into action tools and observation tools.
      // Action tools (image gen, shape ops, etc.) run first in parallel.
      // Observation tools (review, set_view) run after so they see updated canvas.
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ContentBlock & { type: "tool_use" } =>
          block.type === "tool_use",
      );

      const actionBlocks = toolUseBlocks.filter(
        (b) => getToolPhase(b.name) === "action",
      );
      const observationBlocks = toolUseBlocks.filter(
        (b) => getToolPhase(b.name) === "observation",
      );

      // Phase 1: Execute action tools in parallel
      const actionResults = await Promise.all(
        actionBlocks.map(async (toolUse) => {
          const result = await executeCanvasTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            channel,
          );
          return {
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: result.text,
            is_error: result.isError,
          };
        }),
      );

      // Phase 2: Execute observation tools sequentially (in model output order)
      // so each sees the canvas state after all actions + prior observations.
      // Check signal between each so the user can interrupt (e.g. to compile).
      const observationResults: typeof actionResults = [];
      for (const toolUse of observationBlocks) {
        if (signal?.aborted) {
          // If interrupted, still provide a result so the message is well-formed
          observationResults.push({
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: "Observation skipped: request was interrupted.",
            is_error: false,
          });
          continue;
        }

        const result = await executeCanvasTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          channel,
        );
        observationResults.push({
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result.text,
          is_error: result.isError,
        });
      }

      // Combine results in original model output order
      const toolResultMap = new Map(
        [...actionResults, ...observationResults].map((r) => [
          r.tool_use_id,
          r,
        ]),
      );
      const toolResults = toolUseBlocks.map(
        (b) => toolResultMap.get(b.id)!,
      );

      // Track consecutive all-fail turns to prevent infinite retry loops
      const allFailed = toolResults.every((r) => r.is_error);
      consecutiveAllFailTurns = allFailed ? consecutiveAllFailTurns + 1 : 0;

      if (consecutiveAllFailTurns >= MAX_CONSECUTIVE_FAIL_TURNS) {
        channel.push({
          _type: "message",
          text: "Image generation is temporarily unavailable due to rate limiting. Please try again later.",
          complete: true,
          time: 0,
        } as any);
        break;
      }

      // Append tool results as a user message
      messages.push({ role: "user", content: toolResults });
    }
  } finally {
    channel.close();
  }
}

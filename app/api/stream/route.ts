import { streamAgentActions } from "../../../server/agent-service";
import { ActionChannel } from "../../../server/tools/action-channel";
import { AgentPrompt } from "../../../shared/types/AgentPrompt";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const prompt = (await request.json()) as AgentPrompt;

  const channel = new ActionChannel();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // Start the agent in the background - it pushes actions to the channel
      const agentPromise = streamAgentActions(
        prompt,
        channel,
        request.signal,
      ).catch((error: Error) => {
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: error.message })}\n\n`,
          ),
        );
      });

      try {
        // Read actions from the channel and send as SSE
        for await (const action of channel) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(action)}\n\n`));
        }
      } catch (error: any) {
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: error.message })}\n\n`,
          ),
        );
      }

      // Wait for the agent to finish before closing the stream
      await agentPromise;
      safeClose();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

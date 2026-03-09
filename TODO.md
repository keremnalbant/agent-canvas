# TODO

## AskUserQuestion Interactive Loop

`AskUserQuestion` is included in the tools array but currently won't work because the SSE stream is one-directional (server -> client). The agent will block waiting for a response that never comes.

### What's needed:

1. **Detect question messages** - Intercept `AskUserQuestion` events in the `for await` loop in `server/agent-service.ts` and forward them to the client via SSE as a special event type.
2. **Keep Query alive** - Hold a reference to the `Query` object (keyed by session ID) so we can call `query.streamInput()` to feed the user's answer back.
3. **Respond endpoint** - `POST /api/stream/respond` where the client sends the user's answer, looks up the active query by session ID, and feeds the response.
4. **Session state** - In-memory Map of active queries (e.g., `Map<string, Query>`) so the respond endpoint can find the right one.
5. **Client UI** - Chat panel detects "question" SSE events and renders an input prompt instead of a regular message. On submit, POST to `/api/stream/respond`.

## Separate Image MCP Server + Eliminate edit-image Route

Currently `edit-image` still uses an API route (`/api/edit-image`) because the server can't resolve shapeIds to image data - that lives in the client's tldraw editor. This adds an unnecessary round-trip.

### Proposed approach:

Create a dedicated `createImageToolServer()` MCP server with `generate_image` and `edit_image` tools. Both call BFL directly in their handlers (no API route needed).

To solve the shapeId -> image data problem for `edit_image`:
1. When building the prompt on the client, collect all image shape data URLs into a map (`{ [shapeId]: dataUrl }`)
2. Include this map in the prompt (new prompt part or extend existing one)
3. Pass the map to `createImageToolServer()` at creation time
4. The `edit_image` handler resolves shapeIds from the map instead of needing the client

This eliminates `/api/edit-image` entirely. All BFL logic lives in `server/bfl-client.ts`, consumed by the image MCP server.

### Files to change:

- `server/tools/image-tools.ts` - New file: `createImageToolServer()` with `generate_image` and `edit_image`
- `server/tools/canvas-tools.ts` - Remove `generate-image` and `edit-image` from `ACTION_TOOL_MAP` and handler
- `server/agent-service.ts` - Create image server with image data map, add to `mcpServers`
- `shared/schema/PromptPartDefinitions.ts` - Add image data map to prompt (or new prompt part)
- `client/actions/EditImageActionUtil.ts` - Remove fetch call, just create tldraw shape from action data
- `app/api/edit-image/` - Delete

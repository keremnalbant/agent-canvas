import {
  generateImageWithBfl,
  type BFLGenerateRequest,
} from "../../../server/bfl-client";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json()) as BFLGenerateRequest;
  const result = await generateImageWithBfl(body);

  if (!result.success) {
    return Response.json(
      { success: false, error: result.error },
      { status: 502 },
    );
  }

  return Response.json({
    success: true,
    imageUrl: result.imageUrl,
    width: result.width,
    height: result.height,
  });
}

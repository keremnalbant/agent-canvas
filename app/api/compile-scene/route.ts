import {
  generateImageWithBfl,
  type BFLGenerateRequest,
} from "../../../server/bfl-client";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json()) as BFLGenerateRequest;

  // The input_image should be the canvas screenshot (base64 data URL)
  // This gets sent to BFL as img2img reference for coherent compilation
  const result = await generateImageWithBfl({
    prompt: body.prompt,
    input_image: body.input_image,
    width: body.width ?? 1024,
    height: body.height ?? 1024,
    seed: body.seed,
    output_format: "png",
  });

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

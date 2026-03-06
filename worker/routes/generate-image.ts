import { IRequest } from "itty-router";
import { Environment } from "../environment";

const BFL_API_URL = "https://api.bfl.ai/v1/flux-2-pro-preview";
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_DURATION_MS = 90_000;

interface GenerateImageRequest {
  prompt: string;
  input_image?: string;
  input_image_2?: string;
  input_image_3?: string;
  input_image_4?: string;
  input_image_5?: string;
  input_image_6?: string;
  input_image_7?: string;
  input_image_8?: string;
  width?: number;
  height?: number;
  seed?: number;
  safety_tolerance?: number;
  output_format?: "jpeg" | "png";
}

interface BFLSubmitResponse {
  id: string;
  polling_url: string;
  cost: number;
}

interface BFLPollResponse {
  status: "Ready" | "Failed" | "Error" | "Pending" | "Processing";
  result?: {
    sample: string;
  };
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImageAsDataUrl(
  imageUrl: string,
  outputFormat: string,
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      "",
    ),
  );
  const mimeType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mimeType};base64,${base64}`;
}

function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl;
  return dataUrl.slice(commaIndex + 1);
}

function buildBflRequestBody(
  body: GenerateImageRequest,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    prompt: body.prompt,
    width: body.width ?? 1024,
    height: body.height ?? 1024,
    safety_tolerance: body.safety_tolerance ?? 2,
    output_format: body.output_format ?? "png",
  };

  if (body.seed !== undefined) {
    request.seed = body.seed;
  }

  // Handle input images - convert data URLs to raw base64 for BFL
  if (body.input_image) {
    request.input_image = body.input_image.startsWith("data:")
      ? stripDataUrlPrefix(body.input_image)
      : body.input_image;
  }

  const additionalImages = [
    body.input_image_2,
    body.input_image_3,
    body.input_image_4,
    body.input_image_5,
    body.input_image_6,
    body.input_image_7,
    body.input_image_8,
  ];

  additionalImages.forEach((img, index) => {
    if (img) {
      const key = `input_image_${index + 2}`;
      request[key] = img.startsWith("data:") ? stripDataUrlPrefix(img) : img;
    }
  });

  return request;
}

export async function generateImage(request: IRequest, env: Environment) {
  const apiKey = env.BFL_API_KEY;
  if (!apiKey) {
    return Response.json(
      { success: false, error: "BFL_API_KEY not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json()) as GenerateImageRequest;

  if (!body.prompt) {
    return Response.json(
      { success: false, error: "prompt is required" },
      { status: 400 },
    );
  }

  const bflRequestBody = buildBflRequestBody(body);

  // Submit to BFL
  const submitResponse = await fetch(BFL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-key": apiKey,
    },
    body: JSON.stringify(bflRequestBody),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    return Response.json(
      {
        success: false,
        error: `BFL API error (${submitResponse.status}): ${errorText}`,
      },
      { status: 502 },
    );
  }

  const submitResult = (await submitResponse.json()) as BFLSubmitResponse;
  const pollingUrl = submitResult.polling_url;

  if (!pollingUrl) {
    return Response.json(
      { success: false, error: "No polling URL returned from BFL" },
      { status: 502 },
    );
  }

  // Poll for result
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    await sleep(POLL_INTERVAL_MS);

    const pollResponse = await fetch(pollingUrl, {
      headers: {
        accept: "application/json",
        "x-key": apiKey,
      },
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      return Response.json(
        {
          success: false,
          error: `BFL polling error (${pollResponse.status}): ${errorText}`,
        },
        { status: 502 },
      );
    }

    const pollResult = (await pollResponse.json()) as BFLPollResponse;

    if (pollResult.status === "Ready" && pollResult.result?.sample) {
      // Fetch image and convert to data URL for persistence
      const outputFormat = body.output_format ?? "png";
      const imageDataUrl = await fetchImageAsDataUrl(
        pollResult.result.sample,
        outputFormat,
      );

      return Response.json({
        success: true,
        imageUrl: imageDataUrl,
        width: body.width ?? 1024,
        height: body.height ?? 1024,
      });
    }

    if (pollResult.status === "Failed" || pollResult.status === "Error") {
      return Response.json(
        {
          success: false,
          error: pollResult.error ?? "Image generation failed",
        },
        { status: 502 },
      );
    }
  }

  return Response.json(
    { success: false, error: "Image generation timed out after 90 seconds" },
    { status: 504 },
  );
}

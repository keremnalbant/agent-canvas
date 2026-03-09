import https from "node:https";

const BFL_API_URL = "https://api.bfl.ai/v1/flux-2-pro-preview";
const BFL_LABS_API_URL =
  "https://labs.us2.bfl.ai/partners/preview/flux_transparent";
const BFL_LABS_POLL_URL = "https://labs.us2.bfl.ai/v1/get_result";
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_DURATION_MS = 90_000;

// BFL Labs endpoint uses a self-signed certificate.
// We use node:https directly with rejectUnauthorized: false.
const labsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * fetch wrapper for BFL Labs endpoints that skips SSL certificate validation.
 * Uses node:https directly since global fetch doesn't support custom agents.
 */
function labsFetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || "GET",
        headers: options.headers,
        agent: labsAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve({
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            status: res.statusCode ?? 0,
            text: async () => body,
            json: async () => JSON.parse(body),
          });
        });
      },
    );
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
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

interface BFLLabsPollResponse {
  id: string;
  status: "Ready" | "Failed" | "Error" | "Pending" | "Processing";
  result?: {
    start_time: number;
    prompt: string;
    seed: number;
    sample: string;
  };
  error?: string;
}

export interface BFLGenerateRequest {
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

export interface BFLGenerateResult {
  success: boolean;
  imageUrl?: string;
  width: number;
  height: number;
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

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = outputFormat === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mimeType};base64,${base64}`;
}

export function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return dataUrl;
  return dataUrl.slice(commaIndex + 1);
}

function buildBflRequestBody(
  body: BFLGenerateRequest,
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

export async function generateImageWithBfl(
  body: BFLGenerateRequest,
): Promise<BFLGenerateResult> {
  const apiKey = process.env.BFL_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: "BFL_API_KEY not configured",
      width: 0,
      height: 0,
    };
  }

  if (!body.prompt) {
    return { success: false, error: "prompt is required", width: 0, height: 0 };
  }

  const w = body.width ?? 1024;
  const h = body.height ?? 1024;
  const bflRequestBody = buildBflRequestBody(body);

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
    return {
      success: false,
      error: `BFL API error (${submitResponse.status}): ${errorText}`,
      width: w,
      height: h,
    };
  }

  const submitResult = (await submitResponse.json()) as BFLSubmitResponse;
  const pollingUrl = submitResult.polling_url;

  if (!pollingUrl) {
    return {
      success: false,
      error: "No polling URL returned from BFL",
      width: w,
      height: h,
    };
  }

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
      return {
        success: false,
        error: `BFL polling error (${pollResponse.status}): ${errorText}`,
        width: w,
        height: h,
      };
    }

    const pollResult = (await pollResponse.json()) as BFLPollResponse;

    if (pollResult.status === "Ready" && pollResult.result?.sample) {
      const outputFormat = body.output_format ?? "png";
      const imageDataUrl = await fetchImageAsDataUrl(
        pollResult.result.sample,
        outputFormat,
      );
      return { success: true, imageUrl: imageDataUrl, width: w, height: h };
    }

    if (pollResult.status === "Failed" || pollResult.status === "Error") {
      return {
        success: false,
        error: pollResult.error ?? "Image generation failed",
        width: w,
        height: h,
      };
    }
  }

  return {
    success: false,
    error: "Image generation timed out after 90 seconds",
    width: w,
    height: h,
  };
}

export interface BFLTransparentRequest {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  output_format?: "png";
}

export async function generateTransparentImageWithBfl(
  body: BFLTransparentRequest,
): Promise<BFLGenerateResult> {
  const apiKey = process.env.BFL_LABS_API_KEY;
  console.log("[BFL-transparent] Starting transparent generation");
  console.log("[BFL-transparent] API key configured:", !!apiKey);
  console.log("[BFL-transparent] Prompt:", body.prompt?.slice(0, 80));

  if (!apiKey) {
    console.error("[BFL-transparent] BFL_LABS_API_KEY not configured");
    return {
      success: false,
      error: "BFL_LABS_API_KEY not configured",
      width: 0,
      height: 0,
    };
  }

  if (!body.prompt) {
    return { success: false, error: "prompt is required", width: 0, height: 0 };
  }

  const w = body.width ?? 1024;
  const h = body.height ?? 1024;

  const requestBody: Record<string, unknown> = {
    prompt: body.prompt,
    width: w,
    height: h,
    output_format: "png",
  };

  if (body.seed !== undefined) {
    requestBody.seed = body.seed;
  }

  try {
    console.log("[BFL-transparent] Submitting to:", BFL_LABS_API_URL);
    console.log("[BFL-transparent] Request body:", JSON.stringify(requestBody).slice(0, 200));

    const submitResponse = await labsFetch(BFL_LABS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[BFL-transparent] Submit response status:", submitResponse.status);

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error("[BFL-transparent] Submit error:", errorText);
      return {
        success: false,
        error: `BFL Labs API error (${submitResponse.status}): ${errorText}`,
        width: w,
        height: h,
      };
    }

    const submitResultRaw = await submitResponse.text();
    console.log("[BFL-transparent] Submit result raw:", submitResultRaw.slice(0, 500));

    const submitResult = JSON.parse(submitResultRaw) as BFLSubmitResponse;
    const taskId = submitResult.id;

    if (!taskId) {
      console.error("[BFL-transparent] No task ID in response:", submitResultRaw.slice(0, 200));
      return {
        success: false,
        error: "No task ID returned from BFL Labs",
        width: w,
        height: h,
      };
    }

    console.log("[BFL-transparent] Task ID:", taskId);

    const startTime = Date.now();
    let pollAttempt = 0;

    // Use the polling_url from the submit response if available, otherwise construct it
    const basePollUrl = submitResult.polling_url
      ? submitResult.polling_url
      : `${BFL_LABS_POLL_URL}?id=${taskId}`;
    console.log("[BFL-transparent] Using poll URL:", basePollUrl);

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS);
      pollAttempt++;

      console.log(`[BFL-transparent] Poll attempt ${pollAttempt}:`, basePollUrl);

      const pollResponse = await labsFetch(basePollUrl, {
        headers: {
          accept: "application/json",
          "X-Key": apiKey,
        },
      });

      // Parse the body regardless of HTTP status - BFL Labs returns
      // job status in the body even on 500 responses
      const pollBodyText = await pollResponse.text();
      console.log(`[BFL-transparent] Poll response: HTTP ${pollResponse.status}, body: ${pollBodyText.slice(0, 300)}`);

      let pollResult: BFLLabsPollResponse;
      try {
        pollResult = JSON.parse(pollBodyText) as BFLLabsPollResponse;
      } catch {
        // If we can't parse JSON, treat as a transient error and retry
        console.error("[BFL-transparent] Could not parse poll response, retrying...");
        continue;
      }

      if (pollResult.status === "Ready" && pollResult.result?.sample) {
        console.log("[BFL-transparent] Ready! Fetching image from:", pollResult.result.sample.slice(0, 100));
        const imageDataUrl = await fetchImageAsDataUrl(
          pollResult.result.sample,
          "png",
        );
        console.log("[BFL-transparent] Image fetched, data URL length:", imageDataUrl.length);
        return { success: true, imageUrl: imageDataUrl, width: w, height: h };
      }

      if (pollResult.status === "Pending" || pollResult.status === "Processing") {
        // Still working, keep polling
        continue;
      }

      // For Error/Failed status: if this is the first poll attempt,
      // the server might not have started processing yet. Retry a few times.
      if (pollResult.status === "Failed" || pollResult.status === "Error") {
        if (pollAttempt <= 3) {
          console.log(`[BFL-transparent] Got ${pollResult.status} on attempt ${pollAttempt}, retrying...`);
          continue;
        }
        console.error("[BFL-transparent] Generation failed after retries:", pollResult.error, JSON.stringify(pollResult));
        return {
          success: false,
          error: pollResult.error ?? `Transparent image generation failed (status: ${pollResult.status})`,
          width: w,
          height: h,
        };
      }

      // Unknown status, keep polling
      console.log("[BFL-transparent] Unknown status:", pollResult.status, "- retrying");
    }

    console.error("[BFL-transparent] Timed out after 90 seconds");
    return {
      success: false,
      error: "Transparent image generation timed out after 90 seconds",
      width: w,
      height: h,
    };
  } catch (error) {
    console.error("[BFL-transparent] Unexpected error:", error);
    return {
      success: false,
      error: `Transparent generation failed: ${error instanceof Error ? error.message : String(error)}`,
      width: w,
      height: h,
    };
  }
}

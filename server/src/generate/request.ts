import type { ImageContent } from "@earendil-works/pi-ai";

export type GenerateInput = {
  image: ImageContent;
  userRequest: string | undefined;
};

export type ParseResult = { ok: true; input: GenerateInput } | { ok: false; error: string };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
// A circled region is a few hundred KB; this leaves room for a full-page retina capture
export const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_CHARS = 2000;

// Body: { "image": { "data": "<base64>", "mimeType": "image/png" }, "request": "optional text" }
export async function parseGenerateRequest(request: Request): Promise<ParseResult> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return { ok: false, error: `Body is larger than ${MAX_BODY_BYTES} bytes` };
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, error: `Body is larger than ${MAX_BODY_BYTES} bytes` };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: "Body must be JSON" };
  }
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }

  const { image, request: userRequest } = body as Record<string, unknown>;
  if (typeof image !== "object" || image === null) {
    return { ok: false, error: "`image` is required: { data, mimeType }" };
  }

  const { data, mimeType } = image as Record<string, unknown>;
  if (typeof mimeType !== "string" || !IMAGE_TYPES.includes(mimeType)) {
    return { ok: false, error: `\`image.mimeType\` must be one of: ${IMAGE_TYPES.join(", ")}` };
  }
  if (typeof data !== "string" || !isBase64(data)) {
    return { ok: false, error: "`image.data` must be a non-empty base64 string" };
  }

  if (userRequest !== undefined && typeof userRequest !== "string") {
    return { ok: false, error: "`request` must be a string when present" };
  }
  if (userRequest !== undefined && userRequest.length > MAX_REQUEST_CHARS) {
    return { ok: false, error: `\`request\` is longer than ${MAX_REQUEST_CHARS} characters` };
  }

  return { ok: true, input: { image: { type: "image", data, mimeType }, userRequest } };
}

function isBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Meta Model API transport for Muse Image, with no Hypit imports.
 *
 * Kept separate so the HTTP mapping can be exercised outside a Build.
 * Muse Image is OpenAI-images compatible and synchronous: the image arrives as
 * base64 in the POST response. Text-to-image uses /images/generations as JSON;
 * reference images use /images/edits as multipart.
 */

export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_MODEL = "muse-image-1.0";

/** Muse takes a WxH hint that sets the aspect ratio, not the pixel size. */
export const MUSE_SIZES = Object.freeze({
  "1:1": "1024x1024",
  "4:3": "1024x768",
  "3:4": "768x1024",
  "16:9": "1024x576",
  "9:16": "576x1024",
});

function endpoint(base, path) {
  return `${base.replace(/\/+$/u, "")}${path}`;
}

async function decode(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message;
    throw Object.assign(
      new Error(`Muse Image ${label} returned HTTP ${response.status}${detail === undefined ? "" : `: ${detail}`}`),
      body?.error?.code === undefined ? {} : { code: String(body.error.code) },
    );
  }
  const encoded = body?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("Muse Image returned no image data");
  }
  return { bytes: new Uint8Array(Buffer.from(encoded, "base64")), mediaType: "image/png", usage: body.usage };
}

/**
 * Text-to-image.
 * @returns {Promise<{bytes: Uint8Array, mediaType: string, usage?: unknown}>}
 */
export async function generateImage(options) {
  const size = options.size;
  if (!options.prompt) throw new Error("Muse Image requires a prompt");
  if (!size) throw new Error(`Muse Image requires one of: ${Object.keys(MUSE_SIZES).join(", ")}`);
  if (!options.apiKey) throw new Error("Muse Image requires an API key");

  const response = await (options.fetch ?? globalThis.fetch)(
    endpoint(options.baseUrl ?? DEFAULT_BASE_URL, "/images/generations"), {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? DEFAULT_MODEL,
        prompt: options.prompt,
        n: 1,
        size,
        output_format: "png",
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
    });
  return await decode(response, "generation");
}

/**
 * Reference-guided generation or edit. Falls back to text-to-image with no references.
 * @param {{baseUrl?: string, model?: string, apiKey: string, prompt: string, size?: string,
 *          images: ReadonlyArray<{bytes: Uint8Array, mediaType: string}>,
 *          fetch?: typeof globalThis.fetch, timeoutMs?: number}} options
 */
export async function editImage(options) {
  if (!options.prompt) throw new Error("Muse Image requires a prompt");
  if (!options.apiKey) throw new Error("Muse Image requires an API key");
  if (!options.images || options.images.length === 0) {
    return await generateImage(options);
  }

  const form = new FormData();
  form.set("model", options.model ?? DEFAULT_MODEL);
  form.set("prompt", options.prompt);
  form.set("n", "1");
  form.set("output_format", "png");
  if (options.size) form.set("size", options.size);
  options.images.forEach((image, index) => {
    const extension = image.mediaType === "image/jpeg" ? "jpg" : image.mediaType === "image/webp" ? "webp" : "png";
    form.append("image", new Blob([image.bytes], { type: image.mediaType }), `reference-${index}.${extension}`);
  });

  const response = await (options.fetch ?? globalThis.fetch)(
    endpoint(options.baseUrl ?? DEFAULT_BASE_URL, "/images/edits"), {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
    });
  return await decode(response, "edit");
}

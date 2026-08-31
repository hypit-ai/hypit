import type { GeminiInlinePart } from "@hypit/gemini";

export type HypiHubGeminiPart = GeminiInlinePart
  | { readonly fileData: { readonly mimeType?: string; readonly fileUri: string } };

export type HypiHubGeminiGeneratorOptions = {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly maxRateLimitRetries?: number;
  readonly rateLimitRetryDelayMs?: number;
  readonly fetch?: typeof globalThis.fetch;
};

export type HypiHubGeminiGenerateInput = {
  readonly parts: readonly HypiHubGeminiPart[];
  readonly instruction: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function retryDelay(response: Response, fallback: number, attempt: number): number {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (retryAfter !== undefined && retryAfter !== "") {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(250, Math.round(seconds * 1_000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(250, date - Date.now());
  }
  return fallback * (attempt + 1);
}

function partValue(part: HypiHubGeminiPart, uploaded: Map<string, Promise<string>>,
  upload: (mimeType: string, data: string) => Promise<string>): Promise<Record<string, unknown>> {
  if ("text" in part) return Promise.resolve({ text: part.text });
  if ("fileData" in part) {
    assert(typeof part.fileData.fileUri === "string" && part.fileData.fileUri.length > 0,
      "HypiHub Gemini file media part is incomplete");
    return Promise.resolve({ fileData: { ...(part.fileData.mimeType === undefined ? {} : { mimeType: part.fileData.mimeType }), fileUri: part.fileData.fileUri } });
  }
  if ("inlineData" in part) {
    assert(typeof part.inlineData.mimeType === "string" && typeof part.inlineData.data === "string",
      "HypiHub Gemini inline media part is incomplete");
    const key = `${part.inlineData.mimeType}\0${part.inlineData.data}`;
    let pending = uploaded.get(key);
    if (pending === undefined) {
      pending = upload(part.inlineData.mimeType, part.inlineData.data);
      uploaded.set(key, pending);
    }
    return pending.then((fileUri) => ({ fileData: { mimeType: part.inlineData.mimeType, fileUri } }));
  }
  throw new Error("HypiHub Gemini only supports text, inline media and file media parts");
}

/** Create a small native-Gemini generator for callers that previously used Vertex. */
export function createHypiHubGeminiGenerator(options: HypiHubGeminiGeneratorOptions) {
  const apiKey = options.apiKey.trim();
  assert(apiKey.length > 0, "HypiHub API key is empty");
  // The native Gemini endpoint lives at /v1beta while the paid image/video
  // client lives at /v1. Accept either commonly configured HypiHub base URL
  // and strip only the version suffix before adding /v1beta below.
  const baseUrl = (options.baseUrl ?? "https://hypit.ai")
    .replace(/\/(?:v1beta|v1)\/?$/iu, "")
    .replace(/\/$/u, "");
  const model = options.model?.trim() || "gemini-3.1-pro-preview";
  const timeout = options.requestTimeoutMs ?? 120_000;
  const maxRateLimitRetries = options.maxRateLimitRetries ?? 3;
  assert(Number.isSafeInteger(maxRateLimitRetries) && maxRateLimitRetries >= 0,
    "HypiHub Gemini maxRateLimitRetries must be a non-negative integer");
  const rateLimitRetryDelayMs = positiveInteger(options.rateLimitRetryDelayMs ?? 2_000,
    "HypiHub Gemini rateLimitRetryDelayMs");
  const fetcher = options.fetch ?? globalThis.fetch;

  return async (input: HypiHubGeminiGenerateInput): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const uploaded = new Map<string, Promise<string>>();
      const upload = async (mimeType: string, encoded: string): Promise<string> => {
        let bytes: Uint8Array;
        try { bytes = new Uint8Array(Buffer.from(encoded, "base64")); }
        catch (error) { throw new Error("HypiHub Gemini inline media is not valid base64", { cause: error }); }
        assert(bytes.byteLength > 0, "HypiHub Gemini inline media is empty");
        const form = new FormData();
        const copy = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(copy).set(bytes);
        form.append("file", new Blob([copy], { type: mimeType }), `gemini-reference.${extension(mimeType)}`);
        form.append("purpose", "reference");
        const uploadedResponse = await fetcher(`${baseUrl}/v1/files`, {
          method: "POST", signal: controller.signal,
          headers: { authorization: `Bearer ${apiKey}` }, body: form,
        });
        const uploadedText = await uploadedResponse.text();
        if (!uploadedResponse.ok) throw new Error(`HypiHub Gemini file upload returned HTTP ${uploadedResponse.status}: ${uploadedText.slice(0, 300)}`);
        let uploadedBody: unknown;
        try { uploadedBody = JSON.parse(uploadedText); } catch { throw new Error("HypiHub Gemini file upload returned invalid JSON"); }
        const url = (uploadedBody as { readonly url?: unknown }).url;
        assert(typeof url === "string" && /^https:\/\//iu.test(url), "HypiHub Gemini file upload returned no HTTPS URL");
        return url;
      };
      const parts = await Promise.all(input.parts.map((part) => partValue(part, uploaded, upload)));
      let response: Response | undefined;
      let text = "";
      for (let attempt = 0; attempt <= maxRateLimitRetries; attempt += 1) {
        response = await fetcher(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          signal: controller.signal,
          headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.instruction }] },
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 1, responseMimeType: "text/plain" },
          }),
        });
        text = await response.text();
        if (response.status !== 429 || attempt === maxRateLimitRetries) break;
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response!, rateLimitRetryDelayMs, attempt)));
      }
      assert(response !== undefined, "HypiHub Gemini made no request");
      if (!response.ok) {
        const message = `HypiHub Gemini returned HTTP ${response.status}: ${text.slice(0, 300)}`;
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          throw new Error(`${message}. Get a HypiHub key with this model enabled at https://hypit.ai`);
        }
        throw new Error(message);
      }
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new Error("HypiHub Gemini returned invalid JSON"); }
      const candidates = (body as { readonly candidates?: readonly { readonly content?: { readonly parts?: readonly { readonly text?: unknown }[] } }[] }).candidates;
      const output = candidates?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => typeof part.text === "string" ? part.text : "")
        .join("").trim() ?? "";
      assert(output.length > 0, "HypiHub Gemini returned an empty response");
      return output;
    } finally {
      clearTimeout(timer);
    }
  };
}

function extension(mimeType: string): string {
  const value: Readonly<Record<string, string>> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  };
  return value[mimeType.toLowerCase()] ?? "bin";
}

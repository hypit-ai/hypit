import { defineEndpointPackage } from "@narratage/endpoint-kit";
import type { EndpointFulfillment, EndpointInvocationContext } from "@narratage/endpoint-kit";
import {
  generationTypes,
  sealGeneratedAudioSet,
} from "@narratage/generation";
import type { GenerationMediaValue, GenerationRequest } from "@narratage/generation";
import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CanonicalValue, CapabilityRef, Digest } from "@narratage/protocol";
import { credentialRef } from "@narratage/runtime";
import type { CredentialRef } from "@narratage/runtime";

export const xiaomiMimoProviderModuleRef = { name: "@narratage/provider-xiaomi-mimo", version: "1" } as const;
export const xiaomiMimoProviderImplementationDigest = digestOf(
  "@narratage/provider-xiaomi-mimo/chat-completions-tts@1",
);

const mimoModelModule = { name: "@narratage/mimo-tts", version: "1" } as const;
const modelNames = [
  "mimo-v2.5-tts",
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts-voiceclone",
] as const;
type Model = typeof modelNames[number];

const capabilities = Object.fromEntries(modelNames.map((name) => [name, {
  module: mimoModelModule,
  name,
}])) as Readonly<Record<Model, CapabilityRef>>;

type Fetch = typeof globalThis.fetch;

export type CreateXiaomiMimoProviderOptions = {
  readonly instance?: string;
  readonly lane?: string;
  readonly apiBaseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly requestTimeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly maxVoiceSampleBase64Bytes?: number;
  readonly fetch?: Fetch;
  readonly fetchImplementationDigest?: Digest;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  assert(url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1",
    "Xiaomi MiMo apiBaseUrl must use HTTPS or loopback");
  return url.href.replace(/\/$/u, "");
}

function request(value: CanonicalValue, model: Model): GenerationRequest {
  const result = value as unknown as GenerationRequest;
  assert(result.contract === "svml.generation-request@1", "Xiaomi MiMo received a non-generation request");
  assert(result.model === model, `Xiaomi MiMo ${model} received ${result.model}`);
  assert(result.ports !== null && typeof result.ports === "object", "Xiaomi MiMo request has no ports");
  return result;
}

function scalar(req: GenerationRequest, name: string, required = true): string | undefined {
  const values = req.ports[name];
  if (values === undefined) {
    if (required) throw new Error(`${req.model} requires ${name}`);
    return undefined;
  }
  assert(values.length === 1 && typeof values[0] === "string", `${req.model} ${name} must contain one string`);
  return values[0];
}

function credential(context: EndpointInvocationContext): string {
  const value = context.credentials.apiKey?.secret;
  assert(value !== undefined && value.length > 0, "Xiaomi MiMo API key is unavailable");
  return value;
}

async function readVoiceSample(
  context: EndpointInvocationContext,
  req: GenerationRequest,
  maxBase64Bytes: number,
): Promise<string> {
  const values = req.ports.sample;
  assert(values?.length === 1, "MiMo voice clone requires exactly one sample");
  const value = values[0] as GenerationMediaValue;
  assert(value.role === "audio", "MiMo voice clone sample must be audio");
  const supported = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"]);
  assert(supported.has(value.artifact.mediaType), "Xiaomi MiMo accepts only MP3 or WAV voice samples");
  const encodedSize = 4 * Math.ceil(value.artifact.size / 3);
  assert(encodedSize <= maxBase64Bytes,
    `MiMo voice sample exceeds the configured ${maxBase64Bytes}-byte Base64 limit`);
  const bytes = await context.artifacts.get(value.artifact.digest);
  assert(bytes !== undefined, `MiMo voice sample ${value.artifact.digest} is unavailable`);
  assert(bytes.byteLength === value.artifact.size, "MiMo voice sample size differs from its BlobRef");
  const mediaType = value.artifact.mediaType === "audio/x-wav"
    ? "audio/wav"
    : value.artifact.mediaType === "audio/mp3" ? "audio/mpeg" : value.artifact.mediaType;
  const encoded = Buffer.from(bytes).toString("base64");
  assert(Buffer.byteLength(encoded, "utf8") <= maxBase64Bytes,
    `MiMo voice sample exceeds the configured ${maxBase64Bytes}-byte Base64 limit`);
  return `data:${mediaType};base64,${encoded}`;
}

function supports(model: Model, value: CanonicalValue): boolean {
  const req = value as unknown as GenerationRequest;
  if (req?.contract !== "svml.generation-request@1" || req.model !== model
    || req.ports === null || typeof req.ports !== "object") return false;
  const allowed = model === "mimo-v2.5-tts"
    ? new Set(["text", "instruction", "voice"])
    : model === "mimo-v2.5-tts-voicedesign"
      ? new Set(["text", "voiceDescription"])
      : new Set(["text", "instruction", "sample"]);
  return Object.keys(req.ports).every((name) => allowed.has(name));
}

function parseAudio(text: string, maxAudioBytes: number): Uint8Array {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Xiaomi MiMo returned invalid JSON");
  }
  const root = raw as { choices?: Array<{ message?: { audio?: { data?: unknown } } }> };
  const data = root.choices?.[0]?.message?.audio?.data;
  assert(typeof data === "string" && data.length > 0, "Xiaomi MiMo returned no audio data");
  assert(data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(data),
    "Xiaomi MiMo returned malformed Base64 audio");
  const bytes = Uint8Array.from(Buffer.from(data, "base64"));
  assert(bytes.byteLength > 0, "Xiaomi MiMo returned empty audio");
  assert(bytes.byteLength <= maxAudioBytes, "Xiaomi MiMo audio exceeds the configured limit");
  return bytes;
}

async function limitedResponseText(response: Response, maxBytes: number): Promise<string> {
  const announced = response.headers.get("content-length");
  if (announced !== null) {
    const size = Number(announced);
    assert(Number.isSafeInteger(size) && size >= 0, "Xiaomi MiMo returned invalid Content-Length");
    assert(size <= maxBytes, "Xiaomi MiMo response exceeds the configured limit");
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(bytes.byteLength <= maxBytes, "Xiaomi MiMo response exceeds the configured limit");
    return Buffer.from(bytes).toString("utf8");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Xiaomi MiMo response exceeds the configured limit");
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return Buffer.from(bytes).toString("utf8");
}

function fulfillment(value: CanonicalValue, metadata: CanonicalValue): EndpointFulfillment {
  return { value: { kind: "inline", value }, conformance: "exact", delivery: "executed", metadata };
}

export function createXiaomiMimoProvider(options: CreateXiaomiMimoProviderOptions = {}) {
  const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? "https://api.xiaomimimo.com/v1");
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? 180_000, "requestTimeoutMs");
  const maxResponseBytes = positiveInteger(options.maxResponseBytes ?? 64 * 1024 * 1024, "maxResponseBytes");
  const maxVoiceSampleBase64Bytes = positiveInteger(
    options.maxVoiceSampleBase64Bytes ?? 10_000_000,
    "maxVoiceSampleBase64Bytes",
  );
  if (options.fetch !== undefined && options.fetchImplementationDigest === undefined) {
    throw new Error("custom Xiaomi MiMo fetch requires fetchImplementationDigest");
  }
  if (options.fetchImplementationDigest !== undefined && !isDigest(options.fetchImplementationDigest)) {
    throw new Error("Xiaomi MiMo fetchImplementationDigest is invalid");
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  const transportDigest = options.fetchImplementationDigest ?? digestOf("@narratage/provider-xiaomi-mimo/global-fetch@1");
  const endpointCapabilities = modelNames.map((model) => ({
    capability: capabilities[model],
    returns: generationTypes.audioSet,
    lifecycle: "immediate" as const,
    supports: (need: { readonly constraints: CanonicalValue }) => supports(model, need.constraints),
    handler: async (context: EndpointInvocationContext) => {
      const req = request(context.need.constraints, model);
      const text = scalar(req, "text")!;
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
      const audio: Record<string, CanonicalValue> = { format: "wav" };
      if (model === "mimo-v2.5-tts") {
        const instruction = scalar(req, "instruction", false);
        if (instruction !== undefined) messages.push({ role: "user", content: instruction });
        audio.voice = scalar(req, "voice")!;
      } else if (model === "mimo-v2.5-tts-voicedesign") {
        messages.push({ role: "user", content: scalar(req, "voiceDescription")! });
      } else {
        const instruction = scalar(req, "instruction", false);
        if (instruction !== undefined) messages.push({ role: "user", content: instruction });
        audio.voice = await readVoiceSample(context, req, maxVoiceSampleBase64Bytes);
      }
      messages.push({ role: "assistant", content: text });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Xiaomi MiMo request timed out")), requestTimeoutMs);
      let response: Response;
      let responseText: string;
      try {
        response = await fetcher(`${apiBaseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", "api-key": credential(context) },
          body: JSON.stringify({ model, messages, audio }),
          signal: controller.signal,
        });
        responseText = await limitedResponseText(response, maxResponseBytes);
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error(`Xiaomi MiMo returned HTTP ${response.status}: ${responseText.slice(0, 300)}`);
      const bytes = parseAudio(responseText, maxResponseBytes);
      const artifact = await context.artifacts.put(bytes, "audio/wav");
      const result = sealGeneratedAudioSet({ contract: "svml.generated-audio-set@1", audios: [artifact] });
      return fulfillment(result as unknown as CanonicalValue, canonicalize({
        provider: "xiaomi-mimo",
        requestedModel: model,
        outputBytes: bytes.byteLength,
      }));
    },
  }));

  return defineEndpointPackage({
    module: xiaomiMimoProviderModuleRef,
    facet: "tts",
    instance: options.instance ?? "xiaomi-mimo.default",
    ...(options.lane === undefined ? {} : { lane: options.lane }),
    implementation: {
      locator: "@narratage/provider-xiaomi-mimo/tts",
      digest: xiaomiMimoProviderImplementationDigest,
    },
    permissions: [`network:${new URL(apiBaseUrl).hostname}`],
    configuration: canonicalize({
      apiBaseUrl, requestTimeoutMs, maxResponseBytes, maxVoiceSampleBase64Bytes, transportDigest,
    }),
    credentials: { apiKey: options.apiKey ?? credentialRef("env", "MIMO_API_KEY") },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    capabilities: endpointCapabilities,
  });
}

import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { EndpointInvocationContext } from "@hypit/endpoint-kit";
import {
  generationTypes,
  sealGeneratedAudioSet,
} from "@hypit/generation";
import type { GenerationRequest } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { CanonicalValue, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef } from "@hypit/runtime";

export const xiaomiMimoProviderModuleRef = { name: "@hypit/provider-xiaomi-mimo", version: "1" } as const;
const mimoModelModule = { name: "@hypit/mimo-tts", version: "1" } as const;
const modelNames = ["mimo-v2.5-tts-voicedesign"] as const;
type Model = typeof modelNames[number];

const capabilities = Object.fromEntries(modelNames.map((name) => [name, {
  module: mimoModelModule,
  name,
}])) as Readonly<Record<Model, CapabilityRef>>;

type Fetch = typeof globalThis.fetch;

export type CreateXiaomiMimoProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly apiBaseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly requestTimeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly fetch?: Fetch;
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
  assert(result.ports !== null && typeof result.ports === "object", "Xiaomi MiMo request has no ports");
  const allowed = new Set(["text", "voiceDescription"]);
  assert(Object.keys(result.ports).every((name) => allowed.has(name)),
    `${model} request contains an unsupported port`);
  return result;
}

function scalar(req: GenerationRequest, model: Model, name: string, required = true): string | undefined {
  const values = req.ports[name];
  if (values === undefined) {
    if (required) throw new Error(`${model} requires ${name}`);
    return undefined;
  }
  assert(values.length === 1 && typeof values[0] === "string", `${model} ${name} must contain one string`);
  return values[0];
}

function credential(context: EndpointInvocationContext): string {
  const value = context.credentials.apiKey?.secret;
  assert(value !== undefined && value.length > 0, "Xiaomi MiMo API key is unavailable");
  return value;
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

export function createXiaomiMimoProvider(options: CreateXiaomiMimoProviderOptions) {
  const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? "https://api.xiaomimimo.com/v1");
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? 180_000, "requestTimeoutMs");
  const maxResponseBytes = positiveInteger(options.maxResponseBytes ?? 64 * 1024 * 1024, "maxResponseBytes");
  const fetcher = options.fetch ?? globalThis.fetch;
  const endpointCapabilities = modelNames.map((model) => ({
    capability: capabilities[model],
    returns: generationTypes.audioSet,
    lifecycle: "immediate" as const,
    handler: async (context: EndpointInvocationContext) => {
      const req = request(context.need.constraints, model);
      const text = scalar(req, model, "text")!;
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: scalar(req, model, "voiceDescription")! },
      ];
      const audio: Record<string, CanonicalValue> = { format: "wav" };
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
      const artifact = await context.resources.put(bytes, "audio/wav");
      const result = sealGeneratedAudioSet({ audios: [artifact] });
      return { value: { kind: "inline" as const, value: result as unknown as CanonicalValue } };
    },
  }));

  return defineEndpointPackage({
    module: xiaomiMimoProviderModuleRef,
    facet: "tts",
    instance: options.instance ?? "xiaomi-mimo.default",
    pool: options.pool ?? options.instance ?? "xiaomi-mimo.default",
    credentials: { apiKey: options.apiKey ?? credentialRef("env", "MIMO_API_KEY") },
    credentialInputs: { apiKey: { label: "Xiaomi MiMo API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    capabilities: endpointCapabilities,
  });
}

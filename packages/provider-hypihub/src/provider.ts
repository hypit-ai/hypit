import type { AsyncEndpoint, EndpointInvocationContext, EndpointPollContext, EndpointStartContext, EndpointOutcome } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import { generationTypes, sealGeneratedAudioSet, sealGeneratedImageSet, sealGeneratedVideoSet } from "@hypit/generation";
import type { GenerationRequest } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef } from "@hypit/runtime";

export const hypiHubProviderModuleRef = { name: "@hypit/provider-hypihub", version: "1" } as const;

type Kind = "image" | "video" | "audio";
type Route = { capability: CapabilityRef; model: string; kind: Kind };

const routes: readonly Route[] = [
  { capability: { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2" }, model: "bytedance/seedance-2", kind: "video" },
  { capability: { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2-fast" }, model: "bytedance/seedance-2-fast", kind: "video" },
  { capability: { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2-mini" }, model: "bytedance/seedance-2-mini", kind: "video" },
  { capability: { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2.5" }, model: "bytedance/seedance-2-5", kind: "video" },
  { capability: { module: { name: "@hypit/gpt-image", version: "1" }, name: "gpt-image-2" }, model: "gpt-image-2", kind: "image" },
  { capability: { module: { name: "@hypit/nano-banana", version: "1" }, name: "nano-banana-2" }, model: "nano-banana-2", kind: "image" },
  { capability: { module: { name: "@hypit/nano-banana", version: "1" }, name: "nano-banana-pro" }, model: "nano-banana-pro", kind: "image" },
  { capability: { module: { name: "@hypit/seedream", version: "1" }, name: "seedream-5-lite" }, model: "seedream/5-lite-text-to-image", kind: "image" },
  { capability: { module: { name: "@hypit/minimax-h3", version: "1" }, name: "minimax-h3" }, model: "minimax-h3/text-to-video", kind: "video" },
  { capability: { module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video" }, model: "grok-imagine/text-to-video", kind: "video" },
  { capability: { module: { name: "@hypit/grok-imagine", version: "1" }, name: "grok-imagine-video-1.5-preview" }, model: "grok-imagine-video-1-5-preview", kind: "video" },
  { capability: { module: { name: "@hypit/mimo-tts", version: "1" }, name: "mimo-v2.5-tts" }, model: "mimo-v2.5-tts", kind: "audio" },
];

function key(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

const routeMap = new Map(routes.map((route) => [key(route.capability), route]));

export type CreateHypiHubProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
};

type Handle = { contract: "hypit.hypihub-operation@1"; jobId: string; route: string; startedAt: number };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function scalar(request: GenerationRequest, name: string): unknown {
  const value = request.ports[name];
  return value === undefined ? undefined : value[0];
}
function requestFor(route: Route, value: CanonicalValue): Record<string, unknown> {
  const request = value as unknown as GenerationRequest;
  assert(request.ports !== null && typeof request.ports === "object", "HypiHub request has no ports");
  for (const [name, values] of Object.entries(request.ports)) {
    if (values.some((item) => item !== undefined && typeof item === "object")) {
      throw new Error(`HypiHub Provider does not support reference media yet (${name})`);
    }
  }
  const prompt = scalar(request, "prompt");
  if (route.kind === "audio") {
    const text = scalar(request, "text");
    const voice = scalar(request, "voice");
    assert(typeof text === "string" && typeof voice === "string", "HypiHub TTS request requires text and voice");
    return { model: route.model, input: text, voice, output: "binary" };
  }
  assert(typeof prompt === "string", "HypiHub request requires prompt");
  if (route.kind === "image") {
    const resolution = scalar(request, "resolution");
    const aspect = scalar(request, "aspectRatio");
    const size = typeof resolution === "string" && resolution.toUpperCase() === "2K" ? "2048x2048"
      : typeof resolution === "string" && resolution.toUpperCase() === "4K" ? "4096x4096" : "1024x1024";
    return { model: route.model, prompt, ...(aspect === undefined ? {} : { aspect_ratio: aspect }), size, n: 1 };
  }
  const duration = scalar(request, "duration");
  const resolution = scalar(request, "resolution");
  const aspect = scalar(request, "aspectRatio");
  assert(typeof duration === "number", "HypiHub video request requires duration");
  return {
    model: route.model,
    prompt,
    seconds: duration,
    ...(resolution === undefined ? {} : { resolution }),
    ...(aspect === undefined ? {} : { aspect_ratio: aspect }),
  };
}

class Client {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly fetcher: typeof globalThis.fetch;
  constructor(options: { baseUrl: string; timeout: number; fetcher: typeof globalThis.fetch }) {
    this.baseUrl = options.baseUrl.replace(/\/$/u, ""); this.timeout = options.timeout; this.fetcher = options.fetcher;
  }
  async json(path: string, apiKey: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
      });
      const text = await response.text();
      let body: unknown = {};
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new Error(`HypiHub returned invalid JSON (${response.status})`); }
      if (!response.ok) throw new Error(`HypiHub returned HTTP ${response.status}: ${text.slice(0, 300)}`);
      return object(body, "HypiHub response");
    } finally { clearTimeout(timer); }
  }
  async download(url: string): Promise<{ bytes: Uint8Array; mediaType: string }> {
    const response = await this.fetcher(url);
    if (!response.ok) throw new Error(`HypiHub asset returned HTTP ${response.status}`);
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream";
    return { bytes: new Uint8Array(await response.arrayBuffer()), mediaType };
  }
  async binary(path: string, apiKey: string, body: Record<string, unknown>): Promise<{ bytes: Uint8Array; mediaType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HypiHub returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "audio/wav",
      };
    } finally { clearTimeout(timer); }
  }
}

function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: "HYPIHUB_ERROR", message: error instanceof Error ? error.message : String(error) } };
}

function credential(context: EndpointInvocationContext): string {
  const value = context.credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "HypiHub API key is unavailable");
  return value;
}

function jobId(value: Record<string, unknown>): string {
  const id = value.id ?? value.job_id;
  assert(typeof id === "string" && id.length > 0, "HypiHub response has no job id");
  return id;
}

async function complete(client: Client, apiKey: string, route: Route, job: Record<string, unknown>, artifacts: EndpointInvocationContext["artifacts"]): Promise<EndpointOutcome> {
  const assetsResponse = await client.json(`/jobs/${encodeURIComponent(jobId(job))}/assets`, apiKey);
  const items = assetsResponse.items;
  assert(Array.isArray(items) && items.length > 0, "HypiHub job has no assets");
  const blobs: BlobRef[] = [];
  for (const item of items) {
    const asset = object(item, "HypiHub asset");
    assert(typeof asset.url === "string", "HypiHub asset has no URL");
    const downloaded = await client.download(asset.url);
    blobs.push(await artifacts.put(downloaded.bytes, downloaded.mediaType));
  }
  const value = route.kind === "image"
    ? sealGeneratedImageSet({ images: blobs.filter((blob) => blob.mediaType.startsWith("image/")) })
    : sealGeneratedVideoSet({ videos: blobs.filter((blob) => blob.mediaType.startsWith("video/")) });
  return { status: "completed", result: { value: { kind: "inline", value: canonicalize(value) } } };
}

function endpoint(client: Client, pollIntervalMs: number, maxOperationMs: number): AsyncEndpoint {
  return {
    async start(context: EndpointStartContext) {
      try {
        const route = routeMap.get(key(context.need.capability));
        assert(route !== undefined, "HypiHub does not implement this exact capability");
        const apiKey = credential(context);
        if (route.kind === "audio") {
          const audio = await client.binary("/audio/speech", apiKey, requestFor(route, context.need.constraints));
          const artifact = await context.artifacts.put(audio.bytes, audio.mediaType);
          return { status: "completed", result: { value: { kind: "inline", value: canonicalize(sealGeneratedAudioSet({ audios: [artifact] })) } } };
        }
        const response = await client.json(`/${route.kind === "image" ? "images/generations" : "videos"}`, apiKey, {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": context.operation },
          body: JSON.stringify(requestFor(route, context.need.constraints)),
        });
        const status = response.status;
        if (status === "succeeded" || status === "completed") return await complete(client, apiKey, route, response, context.artifacts);
        const handle: Handle = { contract: "hypit.hypihub-operation@1", jobId: jobId(response), route: key(route.capability), startedAt: Date.now() };
        return wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" });
      } catch (error) { return failure(error); }
    },
    async poll(context: EndpointPollContext) {
      try {
        const handle = object(context.handle, "HypiHub handle") as unknown as Handle;
        const route = routeMap.get(key(context.need.capability));
        assert(route !== undefined && handle.contract === "hypit.hypihub-operation@1" && handle.route === key(route.capability), "HypiHub handle is invalid");
        if (Date.now() - handle.startedAt > maxOperationMs) throw new Error("HypiHub operation timed out");
        const apiKey = credential(context);
        const job = await client.json(`/jobs/${encodeURIComponent(handle.jobId)}`, apiKey);
        const status = job.status;
        if (status === "queued" || status === "running" || status === "in_progress") return wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: String(status) });
        if (status === "failed" || status === "queue_expired") throw new Error(`HypiHub job ${status}`);
        if (status !== "succeeded" && status !== "completed") throw new Error(`HypiHub returned unknown job status ${String(status)}`);
        return await complete(client, apiKey, route, { ...job, id: handle.jobId }, context.artifacts);
      } catch (error) { return failure(error); }
    },
  };
}

export function createHypiHubProvider(options: CreateHypiHubProviderOptions = {}) {
  const baseUrl = options.baseUrl ?? "https://apihub.hypit.ai/v1";
  const client = new Client({ baseUrl, timeout: options.requestTimeoutMs ?? 30_000, fetcher: options.fetch ?? globalThis.fetch });
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 5_000, 20 * 60_000);
  return defineEndpointPackage({
    module: hypiHubProviderModuleRef,
    facet: "gateway",
    instance: options.instance ?? "hypihub.default",
    pool: options.pool ?? options.instance ?? "hypihub.default",
    credentials: { apiKey: options.apiKey ?? credentialRef("env", "HYPIHUB_API_KEY") },
    credentialInputs: { apiKey: { label: "HypiHub API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    capabilities: routes.map((route) => ({
      capability: route.capability,
      returns: route.kind === "image" ? generationTypes.imageSet : route.kind === "video" ? generationTypes.videoSet : generationTypes.audioSet,
      lifecycle: "asynchronous" as const,
      endpoint: asyncEndpoint,
      lane: route.capability.name,
    })),
  });
}

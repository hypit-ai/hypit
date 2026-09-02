import type { AsyncEndpoint, EndpointFulfillment, EndpointInvocationContext, EndpointPollContext, EndpointStartContext, EndpointOutcome, ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import { geminiCapabilities, geminiModels, verifyGeminiRequest } from "@hypit/gemini";
import type { GeminiRequest } from "@hypit/gemini";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";
import { sealText } from "@hypit/text";
import { textTypes } from "@hypit/text";
import { createHypiHubGeminiGenerator } from "./gemini.js";
import { hypiHubRouteForCapability, hypiHubRoutes } from "./routes.js";

export const hypiHubProviderModuleRef = { name: "@hypit/provider-hypihub", version: "1" } as const;

export type CreateHypiHubProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  /** Expose HypiHub VoiceDesign. Defaults to enabled; set false only for an explicit alternate Provider. */
  readonly audio?: boolean;
  readonly fetch?: typeof globalThis.fetch;
  /** Overrides the default POST /v1/files upload for referenced artifacts. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore) => Promise<string>;
};

type Handle = { readonly contract: "hypit.hypihub-operation@1"; readonly jobId: string; readonly route: string; readonly startedAt: number };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function capabilityKey(capability: CapabilityRef): string { return `${capability.module.name}@${capability.module.version}#${capability.name}`; }
function apiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");
  assert(trimmed.length > 0, "HypiHub base URL is empty");
  const origin = trimmed.replace(/\/(?:v1beta|v1)$/iu, "");
  return `${origin}/v1`;
}
function credential(context: EndpointInvocationContext): string {
  const value = context.credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "HypiHub login is unavailable; run hypit auth login for HypiHub");
  return value;
}
function guidedMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /API key is unavailable|HypiHub login is unavailable|HTTP (?:401|403|404)\b|not enabled for|model_not_found|no_capable_provider/iu.test(message)
    ? `${message}. Sign in to HypiHub at https://hypit.ai with hypit auth login`
    : message;
}
function failure(error: unknown): EndpointOutcome {
  const message = guidedMessage(error);
  return { status: "failed", failure: { code: "HYPIHUB_ERROR", message } };
}

function inlineGeminiRequest(context: EndpointInvocationContext): GeminiRequest {
  const request = context.need.constraints as unknown;
  verifyGeminiRequest(request);
  return request;
}
function jobId(value: Record<string, unknown>): string {
  const id = value.id ?? value.job_id;
  assert(typeof id === "string" && id.length > 0, "HypiHub response has no job id");
  return id;
}

async function verifyModelRoute(client: HypiHubClient, apiKey: string, model: string, operation: "images" | "image_edits" | "videos" | "audio_speech"): Promise<void> {
  const card = await client.json(`/models/${encodeURIComponent(model)}`, apiKey);
  const endpoints = card.endpoints;
  assert(Array.isArray(endpoints) && endpoints.includes(operation),
    `HypiHub model ${model} is not enabled for ${operation} with this API key`);
}

function dataUrl(bytes: Uint8Array, mediaType: string): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function resolveArtifactInline(artifacts: ResourceStore, artifact: BlobRef): Promise<string> {
  const bytes = await artifacts.get(artifact.resource);
  assert(bytes !== undefined, `HypiHub reference artifact ${artifact.resource} is unavailable`);
  return dataUrl(bytes, artifact.mediaType);
}

function mediaExtension(mediaType: string): string {
  const known: Readonly<Record<string, string>> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/quicktime": "mov",
    "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a",
  };
  return known[mediaType] ?? "bin";
}

class HypiHubClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly fetcher: typeof globalThis.fetch;
  constructor(options: { readonly baseUrl: string; readonly timeout: number; readonly fetcher: typeof globalThis.fetch }) {
    this.baseUrl = options.baseUrl.replace(/\/$/u, ""); this.timeout = options.timeout; this.fetcher = options.fetcher;
  }
  async json(path: string, apiKey: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: controller.signal, headers: { authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) } });
      const text = await response.text(); let body: unknown = {};
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new Error(`HypiHub returned invalid JSON (${response.status})`); }
      if (!response.ok) throw new Error(`HypiHub returned HTTP ${response.status}: ${text.slice(0, 300)}`);
      return object(body, "HypiHub response");
    } finally { clearTimeout(timer); }
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetcher(url);
        if (!response.ok) throw new Error(`HypiHub asset returned HTTP ${response.status}`);
        return { bytes: new Uint8Array(await response.arrayBuffer()), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  async upload(artifact: BlobRef, resources: ResourceStore, apiKey: string): Promise<string> {
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined, `HypiHub reference artifact ${artifact.resource} is unavailable`);
    assert(bytes.byteLength === artifact.size, `HypiHub reference artifact ${artifact.resource} size differs`);
    const form = new FormData();
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    form.append("file", new Blob([copy], { type: artifact.mediaType }),
      `${artifact.resource}.${mediaExtension(artifact.mediaType)}`);
    form.append("purpose", "reference");
    const response = await this.json("/files", apiKey, { method: "POST", body: form });
    assert(typeof response.url === "string" && /^https:\/\//iu.test(response.url),
      "HypiHub file upload returned no HTTPS URL");
    return response.url;
  }
  async binary(path: string, apiKey: string, body: Record<string, unknown>): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`HypiHub returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "audio/wav" };
  }
}

async function complete(client: HypiHubClient, apiKey: string, route: (typeof hypiHubRoutes)[number], id: string, artifacts: ResourceStore): Promise<EndpointOutcome> {
  const response = await client.json(`/jobs/${encodeURIComponent(id)}/assets`, apiKey); const items = response.items;
  assert(Array.isArray(items) && items.length > 0, "HypiHub job has no assets"); const blobs: BlobRef[] = [];
  for (const item of items) { const asset = object(item, "HypiHub asset"); assert(typeof asset.url === "string", "HypiHub asset has no URL"); const downloaded = await client.download(asset.url); blobs.push(await artifacts.put(downloaded.bytes, downloaded.mediaType)); }
  return { status: "completed", result: { value: route.packageResult(blobs) } };
}

async function synthesizeAudio(client: HypiHubClient, context: EndpointInvocationContext, publicAssetUrl: CreateHypiHubProviderOptions["publicAssetUrl"]): Promise<EndpointFulfillment> {
  const route = hypiHubRouteForCapability(context.need.capability);
  assert(route !== undefined && route.media === "audio", "HypiHub does not implement this exact capability");
  const compiled = await route.compile(context.need.constraints, async (artifact) => publicAssetUrl === undefined
    ? await resolveArtifactInline(context.resources, artifact)
    : await publicAssetUrl(artifact, context.resources));
  await verifyModelRoute(client, credential(context), compiled.model, "audio_speech");
  const audio = await client.binary("/audio/speech", credential(context), { model: compiled.model, ...(compiled.input as Record<string, unknown>) });
  const artifact = await context.resources.put(audio.bytes, audio.mediaType);
  return { value: route.packageResult([artifact]) };
}

function endpoint(client: HypiHubClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateHypiHubProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context: EndpointStartContext) {
      try {
        const route = hypiHubRouteForCapability(context.need.capability);
        assert(route !== undefined, "HypiHub does not implement this exact capability"); const apiKey = credential(context);
        const uploaded = new Map<string, Promise<string>>();
        const resolve = (artifact: BlobRef): Promise<string> => {
          const existing = uploaded.get(artifact.resource);
          if (existing !== undefined) return existing;
          const promise = publicAssetUrl === undefined
            ? client.upload(artifact, context.resources, apiKey)
            : publicAssetUrl(artifact, context.resources);
          uploaded.set(artifact.resource, promise);
          return promise;
        };
        const compiled = await route.compile(context.need.constraints, resolve);
        assert(route.media !== "audio", "HypiHub audio capabilities use an immediate endpoint");
        const input = compiled.input as Record<string, unknown>;
        const hasReferences = Object.entries(input).some(([key, value]) => {
          if (!["images", "reference_images", "reference_image_urls", "reference_videos", "reference_audios", "first_frame", "last_frame"].includes(key)) return false;
          return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
        });
        const path = route.media === "image"
          ? (hasReferences ? "/images/edits" : "/images/generations")
          : "/videos";
        await verifyModelRoute(client, apiKey, compiled.model,
          path === "/images/edits" ? "image_edits" : path === "/images/generations" ? "images" : "videos");
        const response = await client.json(path, apiKey, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": context.operation }, body: JSON.stringify({ model: compiled.model, ...input }) });
        const status = response.status; if (status === "succeeded" || status === "completed") return await complete(client, apiKey, route, jobId(response), context.resources);
        const handle: Handle = { contract: "hypit.hypihub-operation@1", jobId: jobId(response), route: capabilityKey(route.capability), startedAt: Date.now() };
        return wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" });
      } catch (error) { return failure(error); }
    },
    async poll(context: EndpointPollContext) {
      try {
        const handle = object(context.handle, "HypiHub handle") as unknown as Handle; const route = hypiHubRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.hypihub-operation@1" && handle.route === capabilityKey(route.capability), "HypiHub handle is invalid");
        if (Date.now() - handle.startedAt > maxOperationMs) throw new Error("HypiHub operation timed out");
        const job = await client.json(`/jobs/${encodeURIComponent(handle.jobId)}`, credential(context)); const status = job.status;
        if (status === "queued" || status === "running" || status === "in_progress") return wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: String(status) });
        if (status === "failed" || status === "queue_expired") {
          const detail = [job.error, job.message, job.reason, job.detail]
            .find((value) => typeof value === "string" && value.length > 0);
          throw new Error(`HypiHub job ${status}${typeof detail === "string" ? `: ${detail}` : ""}`);
        }
        if (status !== "succeeded" && status !== "completed") throw new Error(`HypiHub returned unknown job status ${String(status)}`);
        return await complete(client, credential(context), route, handle.jobId, context.resources);
      } catch (error) { return failure(error); }
    },
  };
}

export function createHypiHubProvider(options: CreateHypiHubProviderOptions = {}) {
  const client = new HypiHubClient({ baseUrl: apiBaseUrl(options.baseUrl ?? "https://hypit.ai/v1"), timeout: options.requestTimeoutMs ?? 30_000, fetcher: options.fetch ?? globalThis.fetch });
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 10_000, 20 * 60_000, options.publicAssetUrl);
  const audioEndpoint: ImmediateEndpointHandler = async (context) => {
    try {
      return await synthesizeAudio(client, context, options.publicAssetUrl);
    } catch (error) {
      throw new Error(guidedMessage(error), { cause: error });
    }
  };
  const geminiEndpoint: ImmediateEndpointHandler = async (context) => {
    const request = inlineGeminiRequest(context);
    const generate = createHypiHubGeminiGenerator({
      apiKey: credential(context),
      model: context.need.capability.name,
      ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      maxRateLimitRetries: 5,
      rateLimitRetryDelayMs: 3_000,
    });
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: request.prompt }];
    for (const item of request.media) {
      const bytes = await context.resources.get(item.artifact.resource);
      assert(bytes !== undefined, `HypiHub Gemini reference artifact ${item.artifact.resource} is unavailable`);
      parts.push({ inlineData: { mimeType: item.artifact.mediaType, data: Buffer.from(bytes).toString("base64") } });
    }
    const value = await generate({ parts, instruction: request.instruction });
    return { value: { kind: "inline", value: canonicalize(sealText(value)) } };
  };
  return defineEndpointPackage({
    module: hypiHubProviderModuleRef, facet: "gateway", instance: options.instance ?? "hypihub.default", pool: options.pool ?? options.instance ?? "hypihub.default",
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "hypihub.oauth") },
    credentialInputs: { apiKey: {
      label: "HypiHub login",
      acquisition: {
        kind: "oauth2-pkce",
        authorizationEndpoint: "https://hypit.ai/oauth/consent",
        tokenEndpoint: "https://hypit.ai/oauth/token",
        clientId: "hyc_d5d5e8e7131b0c877756e66c",
        scopes: ["user:profile", "user:inference"],
      },
    } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    capabilities: [
      ...hypiHubRoutes
      .filter((route) => options.audio !== false || route.media !== "audio")
      .map((route) => route.media === "audio"
        ? { capability: route.capability, returns: route.returns, lifecycle: "immediate" as const, handler: audioEndpoint, lane: route.capability.name }
        : { capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, lane: route.capability.name }),
      ...geminiModels.map((model) => ({
        capability: geminiCapabilities[model],
        returns: textTypes.text,
        lifecycle: "immediate" as const,
        handler: geminiEndpoint,
        lane: "gemini",
      })),
    ],
  });
}

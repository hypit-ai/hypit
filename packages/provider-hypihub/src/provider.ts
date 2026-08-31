import type { AsyncEndpoint, EndpointFulfillment, EndpointInvocationContext, EndpointPollContext, EndpointStartContext, EndpointOutcome, ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ArtifactStore } from "@hypit/runtime";
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
  readonly fetch?: typeof globalThis.fetch;
};

type Handle = { readonly contract: "hypit.hypihub-operation@1"; readonly jobId: string; readonly route: string; readonly startedAt: number };

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function capabilityKey(capability: CapabilityRef): string { return `${capability.module.name}@${capability.module.version}#${capability.name}`; }
function credential(context: EndpointInvocationContext): string {
  const value = context.credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "HypiHub API key is unavailable");
  return value;
}
function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: "HYPIHUB_ERROR", message: error instanceof Error ? error.message : String(error) } };
}
function jobId(value: Record<string, unknown>): string {
  const id = value.id ?? value.job_id;
  assert(typeof id === "string" && id.length > 0, "HypiHub response has no job id");
  return id;
}

function dataUrl(bytes: Uint8Array, mediaType: string): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function resolveArtifactAsDataUrl(artifacts: ArtifactStore, artifact: BlobRef): Promise<string> {
  const bytes = await artifacts.get(artifact.digest);
  assert(bytes !== undefined, `HypiHub reference artifact ${artifact.digest} is unavailable`);
  return dataUrl(bytes, artifact.mediaType);
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
    const response = await this.fetcher(url); if (!response.ok) throw new Error(`HypiHub asset returned HTTP ${response.status}`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
  }
  async binary(path: string, apiKey: string, body: Record<string, unknown>): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`HypiHub returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return { bytes: new Uint8Array(await response.arrayBuffer()), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "audio/wav" };
  }
}

async function complete(client: HypiHubClient, apiKey: string, route: (typeof hypiHubRoutes)[number], id: string, artifacts: ArtifactStore): Promise<EndpointOutcome> {
  const response = await client.json(`/jobs/${encodeURIComponent(id)}/assets`, apiKey); const items = response.items;
  assert(Array.isArray(items) && items.length > 0, "HypiHub job has no assets"); const blobs: BlobRef[] = [];
  for (const item of items) { const asset = object(item, "HypiHub asset"); assert(typeof asset.url === "string", "HypiHub asset has no URL"); const downloaded = await client.download(asset.url); blobs.push(await artifacts.put(downloaded.bytes, downloaded.mediaType)); }
  return { status: "completed", result: { value: route.packageResult(blobs) } };
}

async function synthesizeAudio(client: HypiHubClient, context: EndpointInvocationContext): Promise<EndpointFulfillment> {
  const route = hypiHubRouteForCapability(context.need.capability);
  assert(route !== undefined && route.media === "audio", "HypiHub does not implement this exact capability");
  const compiled = await route.compile(context.need.constraints,
    (artifact) => resolveArtifactAsDataUrl(context.artifacts, artifact));
  const audio = await client.binary("/audio/speech", credential(context), { model: compiled.model, ...(compiled.input as Record<string, unknown>) });
  const artifact = await context.artifacts.put(audio.bytes, audio.mediaType);
  return { value: route.packageResult([artifact]) };
}

function endpoint(client: HypiHubClient, pollIntervalMs: number, maxOperationMs: number): AsyncEndpoint {
  return {
    async start(context: EndpointStartContext) {
      try {
        const route = hypiHubRouteForCapability(context.need.capability);
        assert(route !== undefined, "HypiHub does not implement this exact capability"); const apiKey = credential(context);
        const compiled = await route.compile(context.need.constraints,
          (artifact) => resolveArtifactAsDataUrl(context.artifacts, artifact));
        assert(route.media !== "audio", "HypiHub audio capabilities use an immediate endpoint");
        const input = compiled.input as Record<string, unknown>;
        const hasReferences = Object.entries(input).some(([key, value]) => {
          if (!["images", "reference_images", "reference_image_urls", "reference_videos", "reference_audios", "first_image_url", "last_image_url"].includes(key)) return false;
          return Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.length > 0;
        });
        const path = route.media === "image"
          ? (hasReferences ? "/images/edits" : "/images/generations")
          : "/videos";
        const response = await client.json(path, apiKey, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": context.operation }, body: JSON.stringify({ model: compiled.model, ...input }) });
        const status = response.status; if (status === "succeeded" || status === "completed") return await complete(client, apiKey, route, jobId(response), context.artifacts);
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
        if (status === "failed" || status === "queue_expired") throw new Error(`HypiHub job ${status}`);
        if (status !== "succeeded" && status !== "completed") throw new Error(`HypiHub returned unknown job status ${String(status)}`);
        return await complete(client, credential(context), route, handle.jobId, context.artifacts);
      } catch (error) { return failure(error); }
    },
  };
}

export function createHypiHubProvider(options: CreateHypiHubProviderOptions = {}) {
  const client = new HypiHubClient({ baseUrl: options.baseUrl ?? "https://hypit.ai/v1", timeout: options.requestTimeoutMs ?? 30_000, fetcher: options.fetch ?? globalThis.fetch });
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 5_000, 20 * 60_000);
  const audioEndpoint: ImmediateEndpointHandler = (context) => synthesizeAudio(client, context);
  return defineEndpointPackage({
    module: hypiHubProviderModuleRef, facet: "gateway", instance: options.instance ?? "hypihub.default", pool: options.pool ?? options.instance ?? "hypihub.default",
    credentials: { apiKey: options.apiKey ?? credentialRef("env", "HYPIHUB_API_KEY") }, credentialInputs: { apiKey: { label: "HypiHub API key" } }, defaultConcurrency: options.defaultConcurrency ?? 4,
    capabilities: hypiHubRoutes.map((route) => route.media === "audio"
      ? { capability: route.capability, returns: route.returns, lifecycle: "immediate" as const, handler: audioEndpoint, lane: route.capability.name }
      : { capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, lane: route.capability.name }),
  });
}

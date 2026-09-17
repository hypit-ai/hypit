import { requestDeadline } from "@hypit/runtime-kit";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";
import { monidRouteForCapability, monidRoutes } from "./routes.js";
import { MonidHttpError, MonidServiceError, monidRunFailure, monidTerminalStatuses } from "./errors.js";

export const monidProviderModuleRef = { name: "@hypit/provider-monid", version: "1" } as const;

export type CreateMonidProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: import("@hypit/endpoint-kit").EndpointActionLimits;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  /** Publish a referenced Resource at a URL the service can fetch; replaces the workspace file system upload. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = {
  readonly contract: "hypit.monid-operation@1";
  readonly runId: string;
  readonly route: string;
  readonly startedAt: number;
  readonly url?: string;
};

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function capabilityKey(capability: CapabilityRef): string { return `${capability.module.name}@${capability.module.version}#${capability.name}`; }
function apiBaseUrl(value: string): string {
  let trimmed = value.trim();
  while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  assert(trimmed.length > 0, "Monid base URL is empty");
  return trimmed;
}
function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "Monid apiKey credential is unavailable; store a Monid API key for this Endpoint");
  return value;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: error instanceof MonidServiceError ? error.code : "MONID_ERROR", message: failureMessage(error) } };
}
function runId(run: Record<string, unknown>): string {
  assert(typeof run.runId === "string" && run.runId.length > 0, "Monid response has no runId");
  return run.runId;
}
function httpsUrl(value: unknown, subject: string): string {
  assert(typeof value === "string" && /^https?:\/\//u.test(value), `${subject} has no URL`);
  return value;
}
/**
 * The relayed result. The ModelArk endpoints return the task's `video_url`; MiniMax-H3 returns the
 * video at `content.url`. The link expires, so collection downloads it rather than storing it.
 */
function outputVideoUrl(run: Record<string, unknown>): string {
  const output = object(run.output, "Monid run output");
  const content = output.content === undefined ? undefined : object(output.content, "Monid run output content");
  return httpsUrl(output.video_url ?? content?.video_url ?? content?.url, "Monid run output");
}
const extensions: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
};

class MonidClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly pollIntervalMs: number, readonly fetcher: typeof globalThis.fetch) {}
  async json(path: string, key: string, init: RequestInit = {}): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init, signal: deadline.signal, headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      }));
      const text = await deadline.wait(response.text());
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { body = undefined; }
      // A synchronous run mirrors the provider's HTTP status while still returning the run itself.
      const run = body !== null && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).runId === "string";
      if (!response.ok && !run) throw new MonidHttpError(response.status, response, text, { method: init.method ?? "GET", path });
      assert(body !== undefined, `Monid returned invalid JSON (${response.status})`);
      return { status: response.status, body: object(body, "Monid response") };
    } finally { deadline.finish(); }
  }
  async run(request: { readonly provider: string; readonly endpoint: string; readonly input: Record<string, unknown> }, key: string) {
    return await this.json("/v1/run", key, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  }
  async getRun(id: string, key: string): Promise<Record<string, unknown>> {
    return (await this.json(`/v1/runs/${encodeURIComponent(id)}`, key)).body;
  }
  /** Run a short workspace operation to completion and return its provider output. */
  async completeRun(request: { readonly provider: string; readonly endpoint: string; readonly input: Record<string, unknown> }, key: string): Promise<Record<string, unknown>> {
    let run = (await this.run(request, key)).body;
    const id = runId(run);
    const deadline = requestDeadline(this.timeout);
    try {
      while (!monidTerminalStatuses.includes(String(run.status) as typeof monidTerminalStatuses[number])) {
        await deadline.wait(new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs)));
        run = await this.getRun(id, key);
      }
    } finally { deadline.finish(); }
    const rejected = monidRunFailure(run, id);
    if (rejected !== undefined) throw rejected;
    return object(run.output, `Monid ${request.provider}${request.endpoint} output`);
  }
  /** Upload through the workspace file system (`sfs`) and mint a URL third parties can fetch. */
  async publish(artifact: BlobRef, resources: ResourceStore, key: string): Promise<string> {
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined && bytes.byteLength === artifact.size, `Reference Resource ${artifact.resource} is unavailable or has changed`);
    const path = `hypit/${artifact.resource}.${extensions[artifact.mediaType] ?? artifact.mediaType.split("/")[1] ?? "bin"}`;
    const put = await this.completeRun({ provider: "sfs", endpoint: "/put", input: { path, sizeBytes: bytes.byteLength } }, key);
    const uploadUrl = httpsUrl(put.uploadUrl, "Monid sfs /put output");
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(uploadUrl, { method: "PUT", body: new Blob([new Uint8Array(bytes)]), signal: deadline.signal }));
      assert(response.ok, `Monid file upload returned HTTP ${response.status}`);
    } finally { deadline.finish(); }
    const cat = await this.completeRun({ provider: "sfs", endpoint: "/cat", input: { path, ttl: "1d" } }, key);
    return httpsUrl(cat.url, "Monid sfs /cat output");
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(url, { signal: deadline.signal }));
      if (!response.ok) throw new Error(`Monid asset returned HTTP ${response.status}`);
      return { bytes: new Uint8Array(await deadline.wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    } finally { deadline.finish(); }
  }
}

function resolverFor(client: MonidClient, context: EndpointInvocationContext, publicAssetUrl: CreateMonidProviderOptions["publicAssetUrl"]): GenerationArtifactUrlResolver {
  const resolved = new Map<string, Promise<string>>();
  return (artifact, fields) => {
    const existing = resolved.get(artifact.resource);
    if (existing !== undefined) return existing;
    const promise = publicAssetUrl === undefined
      ? client.publish(artifact, context.resources, apiKey(context.credentials))
      : publicAssetUrl(artifact, context.resources, fields);
    resolved.set(artifact.resource, promise);
    return promise;
  };
}

function endpoint(client: MonidClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateMonidProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const route = monidRouteForCapability(context.need.capability);
        assert(route !== undefined, "Monid does not implement this exact capability");
        const request = route.prepare(context.need.constraints);
        await context.reportProgress?.({ phase: `Preparing Monid request: ${request.service} ${request.endpoint}` });
        let input: Record<string, unknown>;
        try {
          input = await request.compile(resolverFor(client, context, publicAssetUrl));
        } catch (error) {
          throw new MonidServiceError(error instanceof MonidServiceError ? error.code : "MONID_ERROR",
            `Monid request preparation failed; endpoint=${request.endpoint}; generation not submitted: ${failureMessage(error)}`);
        }
        await context.reportProgress?.({ phase: `Submitting Monid request: ${request.service} ${request.endpoint}` });
        const { body: run } = await client.run({ provider: request.service, endpoint: request.endpoint, input }, apiKey(context.credentials));
        const handle: Handle = { contract: "hypit.monid-operation@1", runId: runId(run), route: route.key, startedAt: Date.now() };
        const receipt = { id: handle.runId };
        const ended = monidTerminalStatuses.includes(String(run.status) as typeof monidTerminalStatuses[number]);
        await context.checkpoint?.({ handle: canonicalize(handle), receipt, ...(ended ? { remoteEnded: true as const } : {}) });
        if (!ended) return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: String(run.status) }), receipt };
        const rejected = monidRunFailure(run, handle.runId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        return { status: "ready", handle: canonicalize({ ...handle, url: outputVideoUrl(run) }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      try {
        const handle = object(context.handle, "Monid handle") as unknown as Handle;
        const route = monidRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.monid-operation@1" && handle.route === route.key, "Monid handle is invalid");
        const receipt = { id: handle.runId };
        if (Date.now() - handle.startedAt > maxOperationMs) {
          return { status: "failed", receipt, failure: { code: "MONID_OPERATION_TIMEOUT", message: `Monid run ${handle.runId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const run = await client.getRun(handle.runId, apiKey(context.credentials));
        const status = String(run.status);
        if (!monidTerminalStatuses.includes(status as typeof monidTerminalStatuses[number])) {
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const rejected = monidRunFailure(run, handle.runId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        return { status: "ready", handle: canonicalize({ ...handle, url: outputVideoUrl(run) }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "Monid handle") as unknown as Handle;
        const route = monidRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key, "Monid collection route differs");
        await context.reportProgress?.({ phase: "Receiving generated video" });
        const downloaded = await client.download(httpsUrl(handle.url, "Monid handle"));
        const blob = await context.resources.put(downloaded.bytes, downloaded.mediaType);
        return { status: "completed", result: { value: route.packageResult([blob]) }, receipt: { id: handle.runId } };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export function createMonidProvider(options: CreateMonidProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 10_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs, pollIntervalMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `Monid ${name} must be a positive integer`);
  }
  const client = new MonidClient(apiBaseUrl(options.baseUrl ?? "https://api.monid.ai"), requestTimeoutMs, Math.min(pollIntervalMs, 5_000), options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, pollIntervalMs, operationTimeoutMs, options.publicAssetUrl);
  return defineEndpointPackage({
    module: monidProviderModuleRef, facet: "gateway", instance: options.instance ?? "monid.default", pool: options.pool ?? options.instance ?? "monid.default",
    pricing: { kind: "page", url: "https://monid.ai/tools" },
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "monid.api-key") },
    credentialInputs: { apiKey: { label: "Monid API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: monidRoutes.map((route) => ({
      capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports,
    })),
  });
}

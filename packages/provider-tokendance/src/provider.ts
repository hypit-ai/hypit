import { requestDeadline } from "@hypit/runtime-kit";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome, ImmediateEndpointHandler } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";
import { tokenDanceRouteForCapability, tokenDanceRoutes } from "./routes.js";
import type { TokenDanceRoute } from "./routes.js";
import { TokenDanceHttpError, TokenDanceServiceError, tokenDanceTaskFailure } from "./errors.js";

export const tokenDanceProviderModuleRef = { name: "@hypit/provider-tokendance", version: "1" } as const;

export type CreateTokenDanceProviderOptions = {
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
  /** Publish a referenced Resource at a URL the service can fetch; replaces inline data URLs. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = {
  readonly contract: "hypit.tokendance-operation@1";
  readonly taskId: string;
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
  assert(trimmed.length > 0, "TokenDance base URL is empty");
  return trimmed;
}
function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "TokenDance apiKey credential is unavailable; store a TokenDance API key for this Endpoint");
  return value;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: error instanceof TokenDanceServiceError ? error.code : "TOKENDANCE_ERROR", message: failureMessage(error) } };
}
function httpsUrl(value: unknown, subject: string): string {
  assert(typeof value === "string" && /^https?:\/\//u.test(value), `${subject} has no download URL`);
  return value;
}

class TokenDanceClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}
  async json(path: string, key: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init, signal: deadline.signal, headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      }));
      const text = await deadline.wait(response.text());
      if (!response.ok) {
        const input = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        throw new TokenDanceHttpError(response.status, response, text, {
          method: init.method ?? "GET", path, ...(typeof input?.model === "string" ? { model: input.model } : {}),
        });
      }
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new Error(`TokenDance returned invalid JSON (${response.status})`); }
      return object(body, "TokenDance response");
    } finally { deadline.finish(); }
  }
  /** MiniMax's file API through the gateway; the returned id is referenced as `mm_file://{file_id}`. */
  async uploadMiniMaxInput(bytes: Uint8Array, artifact: BlobRef, key: string): Promise<string> {
    const form = new FormData();
    form.set("purpose", "video_generation_input");
    form.set("file", new Blob([new Uint8Array(bytes)], { type: artifact.mediaType }), `${artifact.resource}.${artifact.mediaType.split("/")[1] ?? "bin"}`);
    const response = await this.json("/minimax/v1/files/upload", key, { method: "POST", body: form });
    const status = object(response.base_resp ?? {}, "TokenDance upload base_resp").status_code;
    assert(status === undefined || status === 0, `TokenDance MiniMax upload rejected: ${String(object(response.base_resp, "TokenDance upload base_resp").status_msg ?? status)}`);
    const id = object(response.file, "TokenDance upload file").file_id;
    assert((typeof id === "string" && id.length > 0) || typeof id === "number", "TokenDance MiniMax upload returned no file_id");
    return `mm_file://${String(id)}`;
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(url, { signal: deadline.signal }));
      if (!response.ok) throw new Error(`TokenDance asset returned HTTP ${response.status}`);
      return { bytes: new Uint8Array(await deadline.wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    } finally { deadline.finish(); }
  }
}

function mediaKind(mediaType: string): "image" | "video" | "audio" | undefined {
  const kind = mediaType.split("/", 1)[0];
  return kind === "image" || kind === "video" || kind === "audio" ? kind : undefined;
}

function resolverFor(client: TokenDanceClient, route: TokenDanceRoute, context: EndpointInvocationContext, publicAssetUrl: CreateTokenDanceProviderOptions["publicAssetUrl"]): GenerationArtifactUrlResolver {
  const resolved = new Map<string, Promise<string>>();
  return (artifact, fields) => {
    const existing = resolved.get(artifact.resource);
    if (existing !== undefined) return existing;
    const promise = (async () => {
      if (publicAssetUrl !== undefined) return await publicAssetUrl(artifact, context.resources, fields);
      const kind = mediaKind(artifact.mediaType);
      const limit = kind === undefined ? undefined : route.mediaLimits[kind];
      assert(limit !== undefined,
        `TokenDance ${route.protocol} accepts ${artifact.mediaType} references only by public URL; configure publicAssetUrl for this Endpoint`);
      assert(artifact.size <= limit,
        `TokenDance ${route.protocol} accepts ${kind} references up to ${limit / 1_000_000} MB; ${artifact.resource} is ${artifact.size} bytes`);
      const bytes = await context.resources.get(artifact.resource);
      assert(bytes !== undefined && bytes.byteLength === artifact.size, `Reference Resource ${artifact.resource} is unavailable or has changed`);
      if (route.protocol === "minimax-video") return await client.uploadMiniMaxInput(bytes, artifact, apiKey(context.credentials));
      return `data:${artifact.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
    })();
    resolved.set(artifact.resource, promise);
    return promise;
  };
}

async function prepare(client: TokenDanceClient, context: EndpointInvocationContext, publicAssetUrl: CreateTokenDanceProviderOptions["publicAssetUrl"]) {
  const route = tokenDanceRouteForCapability(context.need.capability);
  assert(route !== undefined, "TokenDance does not implement this exact capability");
  const request = route.prepare(context.need.constraints);
  await context.reportProgress?.({ phase: `Preparing TokenDance request: ${request.model}` });
  let body: string;
  try {
    body = JSON.stringify(await request.compile(resolverFor(client, route, context, publicAssetUrl)));
    const cap = route.mediaLimits.body;
    assert(cap === undefined || Buffer.byteLength(body) <= cap,
      `TokenDance ${route.protocol} accepts request bodies up to ${(cap ?? 0) / 1_000_000} MB; inline references make this one ${Buffer.byteLength(body)} bytes`);
  } catch (error) {
    throw new TokenDanceServiceError(error instanceof TokenDanceServiceError ? error.code : "TOKENDANCE_ERROR",
      `TokenDance request preparation failed; model=${request.model}; generation not submitted: ${failureMessage(error)}`);
  }
  return { route, model: request.model, body };
}

async function store(client: TokenDanceClient, urls: readonly string[], resources: ResourceStore): Promise<BlobRef[]> {
  const blobs: BlobRef[] = [];
  for (const url of urls) {
    const downloaded = await client.download(url);
    blobs.push(await resources.put(downloaded.bytes, downloaded.mediaType));
  }
  return blobs;
}

const paths = {
  "ark-video": { submit: "/ark/v3/generations/tasks", task: (id: string) => `/ark/v3/generations/tasks/${encodeURIComponent(id)}` },
  "minimax-video": { submit: "/minimax/v2/video_generation", task: (id: string) => `/minimax/v2/query/video_generation/${encodeURIComponent(id)}` },
} as const;

function taskId(protocol: keyof typeof paths, response: Record<string, unknown>): string {
  const id = protocol === "ark-video" ? response.id : response.task_id;
  assert(typeof id === "string" && id.length > 0, "TokenDance response has no task id");
  return id;
}

/** Ark answers the task itself; MiniMax wraps it in `task`. */
function taskBody(protocol: keyof typeof paths, response: Record<string, unknown>): Record<string, unknown> {
  return protocol === "ark-video" ? response : object(response.task, "TokenDance task");
}

function taskVideoUrl(protocol: keyof typeof paths, task: Record<string, unknown>): string {
  const content = object(task.content, "TokenDance task content");
  return httpsUrl(protocol === "ark-video" ? content.video_url : content.url, "TokenDance task");
}

function endpoint(client: TokenDanceClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateTokenDanceProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const { route, model, body } = await prepare(client, context, publicAssetUrl);
        assert(route.protocol !== "ark-image", "TokenDance image capabilities use an immediate endpoint");
        await context.reportProgress?.({ phase: `Submitting TokenDance request: ${model}` });
        const response = await client.json(paths[route.protocol].submit, apiKey(context.credentials), {
          method: "POST", headers: { "content-type": "application/json" }, body,
        });
        const handle: Handle = { contract: "hypit.tokendance-operation@1", taskId: taskId(route.protocol, response), route: route.key, startedAt: Date.now() };
        const receipt = { id: handle.taskId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      try {
        const handle = object(context.handle, "TokenDance handle") as unknown as Handle;
        const route = tokenDanceRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.tokendance-operation@1" && handle.route === route.key && route.protocol !== "ark-image", "TokenDance handle is invalid");
        const receipt = { id: handle.taskId };
        if (Date.now() - handle.startedAt > maxOperationMs) {
          return { status: "failed", receipt, failure: { code: "TOKENDANCE_OPERATION_TIMEOUT", message: `TokenDance task ${handle.taskId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        let response: Record<string, unknown>;
        try {
          response = await client.json(paths[route.protocol].task(handle.taskId), apiKey(context.credentials));
        } catch (error) {
          if (error instanceof TokenDanceHttpError && error.status < 500) return { ...failure(error), receipt };
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "retrying" }), receipt };
        }
        const task = taskBody(route.protocol, response);
        const status = String(task.status);
        if (status === "queued" || status === "running") return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        const rejected = tokenDanceTaskFailure(task, handle.taskId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        assert(status === "succeeded", `TokenDance returned unknown task status ${status}`);
        return { status: "ready", handle: canonicalize({ ...handle, url: taskVideoUrl(route.protocol, task) }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "TokenDance handle") as unknown as Handle;
        const route = tokenDanceRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key, "TokenDance collection route differs");
        await context.reportProgress?.({ phase: "Receiving generated video" });
        const blobs = await store(client, [httpsUrl(handle.url, "TokenDance handle")], context.resources);
        return { status: "completed", result: { value: route.packageResult(blobs) }, receipt: { id: handle.taskId } };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export function createTokenDanceProvider(options: CreateTokenDanceProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `TokenDance ${name} must be a positive integer`);
  }
  const client = new TokenDanceClient(apiBaseUrl(options.baseUrl ?? "https://tokendance.space/gateway"), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 10_000, operationTimeoutMs, options.publicAssetUrl);
  const imageEndpoint: ImmediateEndpointHandler = async (context) => {
    const { route, model, body } = await prepare(client, context, options.publicAssetUrl);
    assert(route.protocol === "ark-image", "TokenDance video capabilities use an asynchronous endpoint");
    await context.reportProgress?.({ phase: `Submitting TokenDance request: ${model}` });
    const response = await client.json("/ark/v3/images/generations", apiKey(context.credentials), {
      method: "POST", headers: { "content-type": "application/json" }, body,
    });
    assert(Array.isArray(response.data) && response.data.length > 0, "TokenDance image response has no data");
    const urls = response.data.map((item, index) => httpsUrl(object(item, `TokenDance image ${index + 1}`).url, `TokenDance image ${index + 1}`));
    await context.reportProgress?.({ phase: "Receiving generated images" });
    return { value: route.packageResult(await store(client, urls, context.resources)) };
  };
  return defineEndpointPackage({
    module: tokenDanceProviderModuleRef, facet: "gateway", instance: options.instance ?? "tokendance.default", pool: options.pool ?? options.instance ?? "tokendance.default",
    pricing: { kind: "page", url: "https://tokendance.space/models" },
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "tokendance.api-key") },
    credentialInputs: { apiKey: { label: "TokenDance API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: tokenDanceRoutes.map((route) => route.protocol === "ark-image"
      ? { capability: route.capability, returns: route.returns, lifecycle: "immediate" as const, handler: imageEndpoint, capacity: route.capability.name, supports: route.supports }
      : { capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports }),
  });
}

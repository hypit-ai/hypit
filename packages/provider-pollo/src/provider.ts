import { requestDeadline } from "@hypit/runtime-kit";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/endpoint-kit";
import { defineEndpointPackage, wakeAfter } from "@hypit/endpoint-kit";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";
import { polloRouteForCapability, polloRoutes } from "./routes.js";
import { PolloHttpError, PolloServiceError, polloTaskFailure } from "./errors.js";

export const polloProviderModuleRef = { name: "@hypit/provider-pollo", version: "1" } as const;

export type CreatePolloProviderOptions = {
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
  /** Publish a referenced Resource at an HTTP(S) URL Pollo can fetch. Pollo accepts no inline media. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = {
  readonly contract: "hypit.pollo-operation@1";
  readonly taskId: string;
  readonly route: string;
  readonly startedAt: number;
  readonly urls?: readonly string[];
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
  assert(trimmed.length > 0, "Pollo base URL is empty");
  return trimmed;
}
function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "Pollo apiKey credential is unavailable; store a Pollo API key for this Endpoint");
  return value;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: error instanceof PolloServiceError ? error.code : "POLLO_ERROR", message: failureMessage(error) } };
}

class PolloClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}
  async json(path: string, key: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init, signal: deadline.signal, headers: { "x-api-key": key, ...(init.headers ?? {}) },
      }));
      const text = await deadline.wait(response.text());
      if (!response.ok) throw new PolloHttpError(response.status, text, { method: init.method ?? "GET", path });
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new Error(`Pollo returned invalid JSON (${response.status})`); }
      return object(body, "Pollo response");
    } finally { deadline.finish(); }
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(url, { signal: deadline.signal }));
      if (!response.ok) throw new Error(`Pollo asset returned HTTP ${response.status}`);
      return { bytes: new Uint8Array(await deadline.wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    } finally { deadline.finish(); }
  }
}

function resolverFor(context: EndpointInvocationContext, publicAssetUrl: CreatePolloProviderOptions["publicAssetUrl"]): GenerationArtifactUrlResolver {
  const resolved = new Map<string, Promise<string>>();
  return (artifact, fields) => {
    const existing = resolved.get(artifact.resource);
    if (existing !== undefined) return existing;
    assert(publicAssetUrl !== undefined,
      "Pollo accepts reference media only by HTTP(S) URL; configure publicAssetUrl for this Endpoint");
    const promise = publicAssetUrl(artifact, context.resources, fields);
    resolved.set(artifact.resource, promise);
    return promise;
  };
}

function endpoint(client: PolloClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreatePolloProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const route = polloRouteForCapability(context.need.capability);
        assert(route !== undefined, "Pollo does not implement this exact capability");
        const request = route.prepare(context.need.constraints);
        await context.reportProgress?.({ phase: `Preparing Pollo request: ${request.path}` });
        let body: Record<string, unknown>;
        try {
          body = await request.compile(resolverFor(context, publicAssetUrl));
        } catch (error) {
          throw new PolloServiceError(error instanceof PolloServiceError ? error.code : "POLLO_ERROR",
            `Pollo request preparation failed; path=${request.path}; generation not submitted: ${failureMessage(error)}`);
        }
        await context.reportProgress?.({ phase: `Submitting Pollo request: ${request.path}` });
        const response = await client.json(request.path, apiKey(context.credentials), {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        });
        assert(typeof response.taskId === "string" && response.taskId.length > 0, "Pollo response has no taskId");
        const handle: Handle = { contract: "hypit.pollo-operation@1", taskId: response.taskId, route: route.key, startedAt: Date.now() };
        const receipt = { id: handle.taskId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: String(response.status ?? "submitted") }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      try {
        const handle = object(context.handle, "Pollo handle") as unknown as Handle;
        const route = polloRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.pollo-operation@1" && handle.route === route.key, "Pollo handle is invalid");
        const receipt = { id: handle.taskId };
        if (Date.now() - handle.startedAt > maxOperationMs) {
          return { status: "failed", receipt, failure: { code: "POLLO_OPERATION_TIMEOUT", message: `Pollo task ${handle.taskId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const task = await client.json(`/v1/generation/${encodeURIComponent(handle.taskId)}/status`, apiKey(context.credentials));
        assert(Array.isArray(task.generations) && task.generations.length > 0, "Pollo task has no generations");
        const generations = task.generations.map((item, index) => object(item, `Pollo generation ${index + 1}`));
        const rejected = polloTaskFailure(generations, handle.taskId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        const pending = generations.find((generation) => generation.status !== "succeed");
        if (pending !== undefined) {
          const status = String(pending.status);
          assert(status === "waiting" || status === "processing", `Pollo returned unknown generation status ${status}`);
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const urls = generations.map((generation, index) => {
          assert(typeof generation.url === "string" && /^https?:\/\//u.test(generation.url), `Pollo generation ${index + 1} has no URL`);
          return generation.url;
        });
        return { status: "ready", handle: canonicalize({ ...handle, urls }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "Pollo handle") as unknown as Handle;
        const route = polloRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key && Array.isArray(handle.urls), "Pollo collection route differs");
        await context.reportProgress?.({ phase: "Receiving generated files" });
        const blobs: BlobRef[] = [];
        for (const url of handle.urls) {
          const downloaded = await client.download(url);
          blobs.push(await context.resources.put(downloaded.bytes, downloaded.mediaType));
        }
        return { status: "completed", result: { value: route.packageResult(blobs) }, receipt: { id: handle.taskId } };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export function createPolloProvider(options: CreatePolloProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `Pollo ${name} must be a positive integer`);
  }
  const client = new PolloClient(apiBaseUrl(options.baseUrl ?? "https://pollo.ai/api/platform"), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 10_000, operationTimeoutMs, options.publicAssetUrl);
  return defineEndpointPackage({
    module: polloProviderModuleRef, facet: "gateway", instance: options.instance ?? "pollo.default", pool: options.pool ?? options.instance ?? "pollo.default",
    pricing: { kind: "page", url: "https://api.pollo.ai/pricing" },
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "pollo.api-key") },
    credentialInputs: { apiKey: { label: "Pollo API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: polloRoutes.map((route) => ({
      capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports,
    })),
  });
}

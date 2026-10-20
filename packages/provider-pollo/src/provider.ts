import { capabilityKey } from "@hypit/hypit/protocol";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/hypit/endpoint";
import { EndpointServiceError, defineEndpoint, wakeAfter } from "@hypit/hypit/endpoint";
import { EndpointHttpError, EndpointResponseError, EndpointTransportError, withRequestDeadline } from "@hypit/hypit/endpoint/http";
import type { GenerationArtifactUrlResolver } from "@hypit/generation/provider";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef } from "@hypit/hypit/protocol";
import { credentialRef } from "@hypit/hypit/endpoint";
import type { CredentialRef, ResourceStore } from "@hypit/hypit/endpoint";
import { polloRouteForCapability, polloRoutes } from "./routes.js";
import { PolloHttpError, PolloServiceError, polloTaskFailure } from "./errors.js";

export const polloProviderModuleRef = { name: "@hypit/provider-pollo", version: "1" } as const;

export type CreatePolloProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: import("@hypit/hypit/endpoint").EndpointActionLimits;
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
function apiBaseUrl(value: string): string {
  let trimmed = value.trim();
  while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  assert(trimmed.length > 0, "Pollo base URL is empty");
  return trimmed;
}
function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  if (typeof value !== "string" || value.length === 0) {
    throw new PolloServiceError("POLLO_CREDENTIAL_UNAVAILABLE",
      "Pollo apiKey credential is unavailable; store a Pollo API key for this Endpoint");
  }
  return value;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  if (!(error instanceof EndpointServiceError || error instanceof EndpointHttpError
    || error instanceof EndpointTransportError || error instanceof EndpointResponseError)) throw error;
  const code = error instanceof EndpointServiceError || error instanceof EndpointHttpError ? error.code : "POLLO_ERROR";
  return { status: "failed", failure: { code, message: failureMessage(error) } };
}
function retrying(error: unknown, handle: CanonicalValue, pollIntervalMs: number, deadlineAt?: number): EndpointOutcome | undefined {
  const delay = error instanceof EndpointTransportError ? pollIntervalMs
    : error instanceof EndpointHttpError && (error.status === 429 || error.status >= 500)
      ? error.retryAfterMs ?? pollIntervalMs : undefined;
  if (delay === undefined) return undefined;
  const now = Date.now();
  return { status: "pending", handle, wakeAt: Math.min(now + delay, deadlineAt ?? Number.MAX_SAFE_INTEGER), progress: { phase: "retrying" } };
}
function unknownSubmission(error: unknown): EndpointOutcome | undefined {
  return error instanceof EndpointTransportError ? { status: "failed", failure: {
    code: "POLLO_SUBMISSION_UNKNOWN",
    message: `Pollo submission transport failed; remote outcome is unknown: ${error.message}`,
  } } : undefined;
}

class PolloClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}
  async json(path: string, key: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    return await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init, signal, headers: { "x-api-key": key, ...(init.headers ?? {}) },
      }));
      const text = await wait(response.text());
      if (!response.ok) throw new PolloHttpError(response.status, response, text, { method: init.method ?? "GET", path });
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new EndpointResponseError(`Pollo returned invalid JSON (${response.status})`); }
      return object(body, "Pollo response");
    }, () => new EndpointTransportError("Pollo request timed out", { timeout: true }));
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    return await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(url, { signal }));
      if (!response.ok) throw new PolloHttpError(response.status, response, "", { method: "GET", path: url });
      return { bytes: new Uint8Array(await wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    });
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
        const body = await request.compile(resolverFor(context, publicAssetUrl));
        await context.reportProgress?.({ phase: `Submitting Pollo request: ${request.path}` });
        let response: Record<string, unknown>;
        try {
          response = await client.json(request.path, apiKey(context.credentials), {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
          });
        } catch (error) {
          const unknown = unknownSubmission(error);
          if (unknown !== undefined) return unknown;
          throw error;
        }
        if (typeof response.taskId !== "string" || response.taskId.length === 0) throw new EndpointResponseError("Pollo response has no taskId");
        const handle: Handle = { contract: "hypit.pollo-operation@1", taskId: response.taskId, route: route.key, startedAt: Date.now() };
        const receipt = { id: handle.taskId };
        await context.checkpoint?.({ status: "accepted", handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: String(response.status ?? "submitted") }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      let operationDeadlineAt: number | undefined;
      try {
        const handle = object(context.handle, "Pollo handle") as unknown as Handle;
        const route = polloRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.pollo-operation@1" && handle.route === route.key, "Pollo handle is invalid");
        const receipt = { id: handle.taskId };
        operationDeadlineAt = handle.startedAt + maxOperationMs;
        if (Date.now() >= operationDeadlineAt) {
          return { status: "failed", receipt, failure: { code: "POLLO_OPERATION_TIMEOUT", message: `Pollo task ${handle.taskId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const task = await client.json(`/v1/generation/${encodeURIComponent(handle.taskId)}/status`, apiKey(context.credentials));
        if (!Array.isArray(task.generations) || task.generations.length === 0) throw new EndpointResponseError("Pollo task has no generations");
        const generations = task.generations.map((item, index) => object(item, `Pollo generation ${index + 1}`));
        const rejected = polloTaskFailure(generations, handle.taskId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        const pending = generations.find((generation) => generation.status !== "succeed");
        if (pending !== undefined) {
          const status = String(pending.status);
          if (status !== "waiting" && status !== "processing") throw new EndpointResponseError(`Pollo returned unknown generation status ${status}`);
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const urls = generations.map((generation, index) => {
          if (typeof generation.url !== "string" || !/^https?:\/\//u.test(generation.url)) throw new EndpointResponseError(`Pollo generation ${index + 1} has no URL`);
          return generation.url;
        });
        return { status: "ready", handle: canonicalize({ ...handle, urls }), receipt };
      } catch (error) {
        return retrying(error, context.handle, pollIntervalMs, operationDeadlineAt) ?? failure(error);
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
        return retrying(error, context.handle, pollIntervalMs) ?? failure(error);
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
  return defineEndpoint({
    instance: options.instance ?? "pollo.default", pool: options.pool ?? options.instance ?? "pollo.default",
    pricing: { kind: "page", url: "https://api.pollo.ai/pricing" },
    credentials: { apiKey: options.apiKey ?? credentialRef("local", "pollo.api-key") },
    credentialInputs: { apiKey: { label: "Pollo API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: polloRoutes.map((route) => ({
      capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports,
    })),
  });
}

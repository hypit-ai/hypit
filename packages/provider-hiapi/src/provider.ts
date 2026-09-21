import { requestDeadline } from "@hypit/runtime-kit";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/endpoint-kit";
import { EndpointResponseError, EndpointServiceError, EndpointTransportError, defineEndpointPackage, pollAgainOrFail, transport, wakeAfter } from "@hypit/endpoint-kit";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CapabilityRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";
import { hiApiRouteForCapability, hiApiRoutes } from "./routes.js";
import type { HiApiMediaLimits } from "./routes.js";
import { HiApiHttpError, HiApiServiceError, hiApiTaskFailure } from "./errors.js";

export const hiApiProviderModuleRef = { name: "@hypit/provider-hiapi", version: "1" } as const;

export type CreateHiApiProviderOptions = {
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
  readonly contract: "hypit.hiapi-operation@1";
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
  assert(trimmed.length > 0, "HiAPI base URL is empty");
  return trimmed;
}
function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0, "HiAPI apiKey credential is unavailable; store a HiAPI API key for this Endpoint");
  return value;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  return { status: "failed", failure: { code: error instanceof EndpointServiceError ? error.code : "HIAPI_ERROR", message: failureMessage(error) } };
}

class HiApiClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}
  async json(path: string, key: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.timeout, () => new EndpointTransportError("HiAPI request timed out"));
    try {
      const response = await transport(deadline.wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init, signal: deadline.signal, headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      })));
      const text = await transport(deadline.wait(response.text()));
      if (!response.ok) {
        const input = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        throw new HiApiHttpError(response.status, response, text, {
          method: init.method ?? "GET", path, ...(typeof input?.model === "string" ? { model: input.model } : {}),
        });
      }
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new EndpointResponseError(`HiAPI returned invalid JSON (${response.status})`); }
      return object(object(body, "HiAPI response").data, "HiAPI response data");
    } finally { deadline.finish(); }
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(url, { signal: deadline.signal }));
      if (!response.ok) throw new Error(`HiAPI asset returned HTTP ${response.status}`);
      return { bytes: new Uint8Array(await deadline.wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    } finally { deadline.finish(); }
  }
}

function resolverFor(limits: HiApiMediaLimits, context: EndpointInvocationContext, publicAssetUrl: CreateHiApiProviderOptions["publicAssetUrl"]): GenerationArtifactUrlResolver {
  const resolved = new Map<string, Promise<string>>();
  let imageBytes = 0;
  return (artifact, fields) => {
    const existing = resolved.get(artifact.resource);
    if (existing !== undefined) return existing;
    const promise = (async () => {
      if (publicAssetUrl !== undefined) return await publicAssetUrl(artifact, context.resources, fields);
      // HiAPI documents data URLs for image and audio inputs; reference videos must be public HTTPS URLs.
      const kind = artifact.mediaType.split("/", 1)[0];
      assert(kind === "image" || kind === "audio",
        `HiAPI accepts ${artifact.mediaType} references only by public URL; configure publicAssetUrl for this Endpoint`);
      const limit = limits[kind];
      assert(limit === undefined || artifact.size <= limit,
        `HiAPI accepts ${kind} references up to ${(limit ?? 0) / 1_000_000} MB for this model; ${artifact.resource} is ${artifact.size} bytes`);
      if (kind === "image") {
        imageBytes += artifact.size;
        assert(limits.imagesTotal === undefined || imageBytes <= limits.imagesTotal,
          `HiAPI accepts reference images up to ${(limits.imagesTotal ?? 0) / 1_000_000} MB combined for this model`);
      }
      const bytes = await context.resources.get(artifact.resource);
      assert(bytes !== undefined && bytes.byteLength === artifact.size, `Reference Resource ${artifact.resource} is unavailable or has changed`);
      return `data:${artifact.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
    })();
    resolved.set(artifact.resource, promise);
    return promise;
  };
}

function endpoint(client: HiApiClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateHiApiProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const route = hiApiRouteForCapability(context.need.capability);
        assert(route !== undefined, "HiAPI does not implement this exact capability");
        const request = route.prepare(context.need.constraints);
        await context.reportProgress?.({ phase: `Preparing HiAPI request: ${request.model}` });
        let body: Record<string, unknown>;
        try {
          body = await request.compile(resolverFor(request.mediaLimits, context, publicAssetUrl));
        } catch (error) {
          throw new HiApiServiceError(error instanceof EndpointServiceError ? error.code : "HIAPI_ERROR",
            `HiAPI request preparation failed; model=${request.model}; generation not submitted: ${failureMessage(error)}`);
        }
        await context.reportProgress?.({ phase: `Submitting HiAPI request: ${request.model}` });
        const response = await client.json("/v1/tasks", apiKey(context.credentials), {
          method: "POST", headers: { "content-type": "application/json", "idempotency-key": context.operation }, body: JSON.stringify(body),
        });
        assert(typeof response.taskId === "string" && response.taskId.length > 0, "HiAPI response has no taskId");
        const handle: Handle = { contract: "hypit.hiapi-operation@1", taskId: response.taskId, route: route.key, startedAt: Date.now() };
        const receipt = { id: handle.taskId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      try {
        const handle = object(context.handle, "HiAPI handle") as unknown as Handle;
        const route = hiApiRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.hiapi-operation@1" && handle.route === route.key, "HiAPI handle is invalid");
        const receipt = { id: handle.taskId };
        if (Date.now() - handle.startedAt > maxOperationMs) {
          return { status: "failed", receipt, failure: { code: "HIAPI_OPERATION_TIMEOUT", message: `HiAPI task ${handle.taskId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const task = await client.json(`/v1/tasks/${encodeURIComponent(handle.taskId)}`, apiKey(context.credentials));
        const status = String(task.status);
        if (status === "queued" || status === "handling" || status === "archiving") {
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const rejected = hiApiTaskFailure(task, handle.taskId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        assert(status === "success", `HiAPI returned unknown task status ${status}`);
        assert(Array.isArray(task.output) && task.output.length > 0, "HiAPI task succeeded without output");
        const urls = task.output.map((item, index) => {
          const url = object(item, `HiAPI output ${index + 1}`).url;
          assert(typeof url === "string" && /^https?:\/\//u.test(url), `HiAPI output ${index + 1} has no URL`);
          return url;
        });
        return { status: "ready", handle: canonicalize({ ...handle, urls }), receipt };
      } catch (error) {
        return pollAgainOrFail(error, { handle: context.handle, pollIntervalMs, failure });
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "HiAPI handle") as unknown as Handle;
        const route = hiApiRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key && Array.isArray(handle.urls), "HiAPI collection route differs");
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

export function createHiApiProvider(options: CreateHiApiProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `HiAPI ${name} must be a positive integer`);
  }
  const client = new HiApiClient(apiBaseUrl(options.baseUrl ?? "https://api.hiapi.ai"), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 10_000, operationTimeoutMs, options.publicAssetUrl);
  return defineEndpointPackage({
    module: hiApiProviderModuleRef, facet: "gateway", instance: options.instance ?? "hiapi.default", pool: options.pool ?? options.instance ?? "hiapi.default",
    pricing: { kind: "page", url: "https://www.hiapi.ai/en/pricing" },
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "hiapi.api-key") },
    credentialInputs: { apiKey: { label: "HiAPI API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: hiApiRoutes.map((route) => ({
      capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports,
    })),
  });
}

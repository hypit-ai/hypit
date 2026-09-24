import { requestDeadline } from "@hypit/runtime-kit";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/endpoint-kit";
import { EndpointResponseError, EndpointServiceError, EndpointTransportError, defineEndpointPackage, pollAgainOrFail, transport, wakeAfter } from "@hypit/endpoint-kit";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef, ResourceStore } from "@hypit/runtime";

import { muApiRouteForCapability, muApiRoutes } from "./routes.js";
import type { MuApiMediaLimits } from "./routes.js";
import { MuApiHttpError, MuApiServiceError, muApiTaskFailure } from "./errors.js";

export const muApiProviderModuleRef = { name: "@hypit/provider-muapi", version: "1" } as const;

export type CreateMuApiProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  /** MuAPI host, with or without its `/api/v1` suffix. */
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: import("@hypit/endpoint-kit").EndpointActionLimits;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  /** Publish a referenced Resource at a URL the service can fetch instead of using MuAPI upload_file. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = {
  readonly contract: "hypit.muapi-operation@1";
  readonly requestId: string;
  readonly route: string;
  readonly startedAt: number;
  readonly urls?: readonly string[];
};

const pendingStatuses = new Set(["queued", "pending", "processing", "starting", "in_progress", "running"]);
const MB = 1_000_000;

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function apiBaseUrl(value: string): string {
  let trimmed = value.trim().replace(/\/+$/u, "");
  assert(trimmed.length > 0, "MuAPI base URL is empty");
  for (const suffix of ["/api/v1", "/v1"]) {
    if (trimmed.toLowerCase().endsWith(suffix)) {
      trimmed = trimmed.slice(0, -suffix.length).replace(/\/+$/u, "");
      break;
    }
  }
  return `${trimmed}/api/v1`;
}

function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  assert(typeof value === "string" && value.length > 0,
    "MuAPI apiKey credential is unavailable; store a MuAPI API key for this Endpoint");
  return value;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failure(error: unknown): EndpointOutcome {
  return {
    status: "failed",
    failure: {
      code: error instanceof EndpointServiceError ? error.code : "MUAPI_ERROR",
      message: failureMessage(error),
    },
  };
}

function requestId(body: Record<string, unknown>): string {
  const value = body.request_id;
  assert(typeof value === "string" && value.trim().length > 0, "MuAPI response has no request_id");
  return value.trim();
}

function httpsUrl(value: unknown, subject: string): string {
  assert(typeof value === "string" && /^https:\/\//u.test(value), `${subject} has no HTTPS URL`);
  return value;
}

function outputUrls(run: Record<string, unknown>): readonly string[] {
  const from = (value: unknown, subject: string): readonly string[] => {
    if (typeof value === "string") return [httpsUrl(value, subject)];
    if (Array.isArray(value)) return value.flatMap((item, index) => from(item, `${subject} ${index + 1}`));
    if (value !== null && typeof value === "object") {
      const item = value as Record<string, unknown>;
      for (const key of ["video_url", "output_url", "url", "video"]) {
        if (item[key] !== undefined) return from(item[key], `${subject}.${key}`);
      }
    }
    return [];
  };
  for (const key of ["outputs", "output", "output_url", "video_url", "url"]) {
    const urls = from(run[key], `MuAPI ${key}`);
    if (urls.length > 0) return urls;
  }
  throw new Error("MuAPI completed task has no downloadable output URL");
}

const extensions: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/quicktime": "mov", "audio/wav": "wav", "audio/mpeg": "mp3",
};

class MuApiClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}

  async json(path: string, key: string, init: RequestInit = {}, model?: string): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.timeout, () => new EndpointTransportError("MuAPI request timed out"));
    try {
      const response = await transport(deadline.wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: deadline.signal,
        headers: { "x-api-key": key, ...(init.headers ?? {}) },
      })));
      const text = await transport(deadline.wait(response.text()));
      if (!response.ok) {
        throw new MuApiHttpError(response.status, response, text, {
          method: init.method ?? "GET", path, ...(model === undefined ? {} : { model }),
        });
      }
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch {
        throw new EndpointResponseError(`MuAPI returned invalid JSON (${response.status})`);
      }
      return object(body, "MuAPI response");
    } finally { deadline.finish(); }
  }

  async upload(artifact: BlobRef, resources: ResourceStore, key: string, limit: number | undefined): Promise<string> {
    assert(limit !== undefined, `MuAPI upload_file does not support ${artifact.mediaType} references in this Provider surface`);
    assert(artifact.size <= limit,
      `MuAPI accepts ${artifact.mediaType} references up to ${limit / MB} MB; ${artifact.resource} is ${artifact.size} bytes`);
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined && bytes.byteLength === artifact.size,
      `Reference Resource ${artifact.resource} is unavailable or has changed`);
    const form = new FormData();
    const extension = extensions[artifact.mediaType] ?? artifact.mediaType.split("/", 2)[1] ?? "bin";
    form.append("file", new Blob([new Uint8Array(bytes)], { type: artifact.mediaType }), `${artifact.resource}.${extension}`);
    const response = await this.json("/upload_file", key, { method: "POST", body: form });
    return httpsUrl(response.url, "MuAPI upload_file response");
  }

  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const deadline = requestDeadline(this.timeout);
    try {
      const response = await deadline.wait(this.fetcher(url, { signal: deadline.signal }));
      if (!response.ok) throw new Error(`MuAPI asset returned HTTP ${response.status}`);
      return {
        bytes: new Uint8Array(await deadline.wait(response.arrayBuffer())),
        mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "video/mp4",
      };
    } finally { deadline.finish(); }
  }
}

function resolverFor(
  client: MuApiClient,
  context: EndpointInvocationContext,
  key: string,
  limits: MuApiMediaLimits,
  publicAssetUrl: CreateMuApiProviderOptions["publicAssetUrl"],
): GenerationArtifactUrlResolver {
  const resolved = new Map<string, Promise<string>>();
  return (artifact, fields) => {
    const existing = resolved.get(artifact.resource);
    if (existing !== undefined) return existing;
    const kind = artifact.mediaType.split("/", 1)[0] as keyof MuApiMediaLimits;
    const promise = publicAssetUrl === undefined
      ? client.upload(artifact, context.resources, key, limits[kind])
      : publicAssetUrl(artifact, context.resources, fields);
    resolved.set(artifact.resource, promise);
    return promise;
  };
}

function endpoint(
  client: MuApiClient,
  pollIntervalMs: number,
  maxOperationMs: number,
  publicAssetUrl: CreateMuApiProviderOptions["publicAssetUrl"],
): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const route = muApiRouteForCapability(context.need.capability);
        assert(route !== undefined, "MuAPI does not implement this exact capability");
        const request = route.prepare(context.need.constraints);
        await context.reportProgress?.({ phase: `Preparing MuAPI request: ${request.model}` });
        let body: Record<string, unknown>;
        try {
          body = await request.compile(resolverFor(client, context, apiKey(context.credentials), request.mediaLimits, publicAssetUrl));
        } catch (error) {
          throw new MuApiServiceError(error instanceof EndpointServiceError ? error.code : "MUAPI_ERROR",
            `MuAPI request preparation failed; model=${request.model}; generation not submitted: ${failureMessage(error)}`);
        }
        await context.reportProgress?.({ phase: `Submitting MuAPI request: ${request.model}` });
        const response = await client.json(`/${encodeURIComponent(request.model)}`, apiKey(context.credentials), {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
        }, request.model);
        const id = requestId(response);
        const handle: Handle = { contract: "hypit.muapi-operation@1", requestId: id, route: route.key, startedAt: Date.now() };
        const receipt = { id };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      try {
        const handle = object(context.handle, "MuAPI handle") as unknown as Handle;
        const route = muApiRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.muapi-operation@1" && handle.route === route.key,
          "MuAPI handle is invalid");
        const receipt = { id: handle.requestId };
        if (Date.now() - handle.startedAt > maxOperationMs) {
          return { status: "failed", receipt, failure: { code: "MUAPI_OPERATION_TIMEOUT", message: `MuAPI task ${handle.requestId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const task = await client.json(`/predictions/${encodeURIComponent(handle.requestId)}/result`, apiKey(context.credentials));
        const status = String(task.status ?? "").toLowerCase();
        if (pendingStatuses.has(status)) {
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const rejected = muApiTaskFailure(task, handle.requestId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        if (status !== "completed" && status !== "succeeded" && status !== "success") {
          throw new Error(`MuAPI returned unknown task status ${status || "<empty>"}`);
        }
        return { status: "ready", handle: canonicalize({ ...handle, urls: outputUrls(task) }), receipt };
      } catch (error) {
        return pollAgainOrFail(error, { handle: context.handle, pollIntervalMs, failure });
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "MuAPI handle") as unknown as Handle;
        const route = muApiRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key && Array.isArray(handle.urls), "MuAPI collection route differs");
        await context.reportProgress?.({ phase: `Receiving ${handle.urls.length} generated video${handle.urls.length === 1 ? "" : "s"}` });
        const blobs: BlobRef[] = [];
        for (const url of handle.urls) {
          const downloaded = await client.download(httpsUrl(url, "MuAPI result"));
          blobs.push(await context.resources.put(downloaded.bytes, downloaded.mediaType));
        }
        return { status: "completed", result: { value: route.packageResult(blobs) }, receipt: { id: handle.requestId } };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export function createMuApiProvider(options: CreateMuApiProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 10_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs, pollIntervalMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `MuAPI ${name} must be a positive integer`);
  }
  const client = new MuApiClient(apiBaseUrl(options.baseUrl ?? "https://api.muapi.ai"), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, Math.min(pollIntervalMs, 5_000), operationTimeoutMs, options.publicAssetUrl);
  return defineEndpointPackage({
    module: muApiProviderModuleRef,
    facet: "gateway",
    instance: options.instance ?? "muapi.default",
    pool: options.pool ?? options.instance ?? "muapi.default",
    pricing: { kind: "page", url: "https://muapi.ai/ai-video-api" },
    credentials: { apiKey: options.apiKey ?? credentialRef("os", "muapi.api-key") },
    credentialInputs: { apiKey: { label: "MuAPI API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: muApiRoutes.map((route) => ({
      capability: route.capability,
      returns: route.returns,
      lifecycle: "asynchronous" as const,
      endpoint: asyncEndpoint,
      capacity: route.capability.name,
      supports: route.supports,
    })),
  });
}

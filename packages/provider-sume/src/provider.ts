import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/hypit/endpoint";
import { EndpointServiceError, credentialRef, defineEndpoint, wakeAfter } from "@hypit/hypit/endpoint";
import type { CredentialRef, EndpointActionLimits, ResourceStore } from "@hypit/hypit/endpoint";
import { EndpointHttpError, EndpointResponseError, EndpointTransportError, withRequestDeadline } from "@hypit/hypit/endpoint/http";
import type { GenerationArtifactUrlResolver } from "@hypit/generation";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/hypit/protocol";
import { sumeRouteForCapability, sumeRoutes } from "./routes.js";
import { SumeHttpError, SumeServiceError, sumeJobFailure } from "./errors.js";

export const sumeProviderModuleRef = { name: "@hypit/provider-sume", version: "1" } as const;

export type CreateSumeProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly baseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: EndpointActionLimits;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  /** Publish a referenced Resource at a URL the service can fetch; replaces Sume's upload URL. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = {
  readonly contract: "hypit.sume-operation@1";
  readonly jobId: string;
  readonly route: string;
  readonly startedAt: number;
  readonly urls?: readonly string[];
};

const extensions: Readonly<Record<string, string>> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac", "audio/mp4": "m4a",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function apiBaseUrl(value: string): string {
  let trimmed = value.trim();
  while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  assert(trimmed.length > 0, "Sume base URL is empty");
  return trimmed;
}
function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  if (typeof value !== "string" || value.length === 0) {
    throw new SumeServiceError("SUME_CREDENTIAL_UNAVAILABLE",
      "Sume apiKey credential is unavailable; store a Sume API key for this Endpoint");
  }
  return value;
}
function httpsUrl(value: unknown, subject: string): string {
  assert(typeof value === "string" && /^https:\/\//u.test(value), `${subject} has no HTTPS URL`);
  return value;
}
function failure(error: unknown): EndpointOutcome {
  if (!(error instanceof EndpointServiceError || error instanceof EndpointHttpError
    || error instanceof EndpointTransportError || error instanceof EndpointResponseError)) throw error;
  const code = error instanceof EndpointServiceError || error instanceof EndpointHttpError ? error.code : "SUME_ERROR";
  return { status: "failed", failure: { code, message: error.message } };
}
function retrying(error: unknown, handle: CanonicalValue, pollIntervalMs: number, deadlineAt?: number): EndpointOutcome | undefined {
  const delay = error instanceof EndpointTransportError ? pollIntervalMs
    : error instanceof EndpointHttpError && (error.status === 429 || error.status >= 500)
      ? error.retryAfterMs ?? pollIntervalMs : undefined;
  if (delay === undefined) return undefined;
  return { status: "pending", handle, wakeAt: Math.min(Date.now() + delay, deadlineAt ?? Number.MAX_SAFE_INTEGER), progress: { phase: "retrying" } };
}
function unknownSubmission(error: unknown): EndpointOutcome | undefined {
  return error instanceof EndpointTransportError ? { status: "failed", failure: {
    code: "SUME_SUBMISSION_UNKNOWN",
    message: `Sume submission transport failed; remote outcome is unknown: ${error.message}`,
  } } : undefined;
}

class SumeClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}

  /** One authenticated call; returns the `data` member of Sume's envelope. */
  async json(path: string, key: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    return await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init, signal, headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      }));
      const text = await wait(response.text());
      if (!response.ok) {
        const input = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        throw new SumeHttpError(response.status, response, text, {
          method: init.method ?? "GET", path, ...(typeof input?.model === "string" ? { model: input.model } : {}),
        });
      }
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new EndpointResponseError(`Sume returned invalid JSON (${response.status})`); }
      return object(object(body, "Sume response").data, "Sume response data");
    }, () => new EndpointTransportError("Sume request timed out", { timeout: true }));
  }

  /** Ask for an upload URL, PUT the Resource there and return the public HTTPS URL a job reads. */
  async upload(artifact: BlobRef, resources: ResourceStore, key: string): Promise<string> {
    const kind = artifact.mediaType.split("/", 1)[0] ?? "";
    assert(kind === "image" || kind === "video" || kind === "audio",
      `Sume accepts image, audio and video references, not ${artifact.mediaType}`);
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined && bytes.byteLength === artifact.size, `Reference Resource ${artifact.resource} is unavailable or has changed`);
    const slot = await this.json("/v1/files/generate-upload-url", key, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content_type: artifact.mediaType,
        size_bytes: artifact.size,
        filename: `${artifact.resource}.${extensions[artifact.mediaType] ?? "bin"}`,
      }),
    });
    const uploadUrl = httpsUrl(slot.upload_url, "Sume upload slot");
    const headers = slot.upload_headers === undefined ? {} : object(slot.upload_headers, "Sume upload headers") as Record<string, string>;
    await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(uploadUrl, {
        method: "PUT", signal, headers: { "content-type": artifact.mediaType, ...headers }, body: new Uint8Array(bytes),
      }));
      // The upload URL is presigned; its path is a credential and stays out of the error.
      if (!response.ok) throw new SumeHttpError(response.status, response, "", { method: "PUT", path: "[upload-url]" });
      await wait(response.arrayBuffer());
    }, () => new EndpointTransportError("Sume upload timed out", { timeout: true }));
    return httpsUrl(slot.public_url, "Sume upload slot");
  }

  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    return await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(url, { signal }));
      if (!response.ok) throw new SumeHttpError(response.status, response, "", { method: "GET", path: "[result-url]" });
      return { bytes: new Uint8Array(await wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    }, () => new EndpointTransportError("Sume download timed out", { timeout: true }));
  }
}

function resolverFor(client: SumeClient, context: EndpointInvocationContext, publicAssetUrl: CreateSumeProviderOptions["publicAssetUrl"]): GenerationArtifactUrlResolver {
  const resolved = new Map<string, Promise<string>>();
  return (artifact, fields) => {
    const existing = resolved.get(artifact.resource);
    if (existing !== undefined) return existing;
    const promise = publicAssetUrl === undefined
      ? client.upload(artifact, context.resources, apiKey(context.credentials))
      : publicAssetUrl(artifact, context.resources, fields);
    resolved.set(artifact.resource, promise);
    return promise;
  };
}

/** Job statuses before a terminal one. */
const pendingStatuses: readonly string[] = ["queued", "processing"];

function endpoint(client: SumeClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateSumeProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const route = sumeRouteForCapability(context.need.capability);
        assert(route !== undefined, "Sume does not implement this exact capability");
        const request = route.prepare(context.need.constraints);
        await context.reportProgress?.({ phase: `Preparing Sume request: ${request.model}` });
        const body = await request.compile(resolverFor(client, context, publicAssetUrl));
        await context.reportProgress?.({ phase: `Submitting Sume request: ${request.model}` });
        let response: Record<string, unknown>;
        try {
          response = await client.json(request.media === "image" ? "/v1/images" : "/v1/video-router/generate", apiKey(context.credentials), {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": context.operation },
            body: JSON.stringify(body),
          });
        } catch (error) {
          const unknown = unknownSubmission(error);
          if (unknown !== undefined) return unknown;
          throw error;
        }
        const job = response.job === undefined ? undefined : object(response.job, "Sume job");
        const jobId = job?.id ?? response.request_id;
        if (typeof jobId !== "string" || jobId.length === 0) throw new EndpointResponseError("Sume response has no job id");
        const handle: Handle = { contract: "hypit.sume-operation@1", jobId, route: route.key, startedAt: Date.now() };
        const receipt = { id: jobId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      let operationDeadlineAt: number | undefined;
      try {
        const handle = object(context.handle, "Sume handle") as unknown as Handle;
        const route = sumeRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.sume-operation@1" && handle.route === route.key, "Sume handle is invalid");
        const receipt = { id: handle.jobId };
        operationDeadlineAt = handle.startedAt + maxOperationMs;
        if (Date.now() >= operationDeadlineAt) {
          return { status: "failed", receipt, failure: { code: "SUME_OPERATION_TIMEOUT", message: `Sume job ${handle.jobId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const key = apiKey(context.credentials);
        const id = encodeURIComponent(handle.jobId);
        const state = await client.json(`/v1/jobs/${id}/status`, key);
        const status = String(state.sume_status);
        if (pendingStatuses.includes(status)) {
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const job = state.job === undefined || state.job === null ? undefined : object(state.job, "Sume job");
        const rejected = sumeJobFailure(status, job, handle.jobId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        if (status !== "completed") throw new EndpointResponseError(`Sume returned unknown job status ${status}`);
        const result = object((await client.json(`/v1/jobs/${id}/result`, key)).result, "Sume job result");
        const artifacts = Array.isArray(result.artifacts) ? result.artifacts.map((item, index) => object(item, `Sume artifact ${index + 1}`)) : [];
        const media = artifacts.filter((item) => item.type === route.result);
        if (media.length === 0) throw new EndpointResponseError(`Sume job completed without ${route.result} artifacts`);
        const urls = media.map((item, index) => httpsUrl(item.url, `Sume ${route.result} artifact ${index + 1}`));
        return { status: "ready", handle: canonicalize({ ...handle, urls }), receipt };
      } catch (error) {
        return retrying(error, context.handle, pollIntervalMs, operationDeadlineAt) ?? failure(error);
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "Sume handle") as unknown as Handle;
        const route = sumeRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key && Array.isArray(handle.urls), "Sume collection route differs");
        await context.reportProgress?.({ phase: "Receiving generated files" });
        const blobs: BlobRef[] = [];
        for (const url of handle.urls) {
          const downloaded = await client.download(url);
          blobs.push(await context.resources.put(downloaded.bytes, downloaded.mediaType));
        }
        return { status: "completed", result: { value: route.packageResult(blobs) }, receipt: { id: handle.jobId } };
      } catch (error) {
        return retrying(error, context.handle, pollIntervalMs) ?? failure(error);
      }
    },
  };
}

export function createSumeProvider(options: CreateSumeProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `Sume ${name} must be a positive integer`);
  }
  const client = new SumeClient(apiBaseUrl(options.baseUrl ?? "https://api.sume.com"), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 5_000, operationTimeoutMs, options.publicAssetUrl);
  return defineEndpoint({
    instance: options.instance ?? "sume.default", pool: options.pool ?? options.instance ?? "sume.default",
    pricing: { kind: "page", url: "https://www.sume.com/pricing/api" },
    credentials: { apiKey: options.apiKey ?? credentialRef("local", "sume.api-key") },
    credentialInputs: { apiKey: { label: "Sume API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 2,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: sumeRoutes.map((route) => ({
      capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports,
    })),
  });
}

import { capabilityKey } from "@hypit/hypit/protocol";
import type { AsyncEndpoint, EndpointCredential, EndpointInvocationContext, EndpointOutcome } from "@hypit/hypit/endpoint";
import { EndpointServiceError, defineEndpoint, wakeAfter } from "@hypit/hypit/endpoint";
import { EndpointHttpError, EndpointResponseError, EndpointTransportError, withRequestDeadline } from "@hypit/hypit/endpoint/http";
import type { GenerationArtifactUrlResolver } from "@hypit/generation/provider";
import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef } from "@hypit/hypit/protocol";
import { credentialRef } from "@hypit/hypit/endpoint";
import type { CredentialRef, ResourceStore } from "@hypit/hypit/endpoint";
import { beatApiRouteForCapability, beatApiRoutes } from "./routes.js";
import { BeatApiHttpError, BeatApiServiceError, beatApiTaskFailure } from "./errors.js";

export const beatApiProviderModuleRef = { name: "@hypit/provider-beatapi", version: "1" } as const;

export type CreateBeatApiProviderOptions = {
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
  /** Publish a referenced Resource at a URL the service can fetch; replaces the `/v1/files` upload. */
  readonly publicAssetUrl?: (artifact: BlobRef, artifacts: ResourceStore, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string>;
};

type Handle = {
  readonly contract: "hypit.beatapi-operation@1";
  readonly taskId: string;
  readonly route: string;
  readonly startedAt: number;
  readonly urls?: readonly string[];
};

const MB = 1_000_000;

/** Per-file sizes and containers `POST /v1/files` accepts, by media kind. */
const uploadLimits: Readonly<Record<string, { readonly bytes: number; readonly mediaTypes: readonly string[] }>> = {
  image: { bytes: 50 * MB, mediaTypes: ["image/png", "image/jpeg", "image/jpg", "image/webp"] },
  audio: { bytes: 50 * MB, mediaTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac", "audio/mp4", "audio/x-m4a"] },
  video: { bytes: 100 * MB, mediaTypes: ["video/mp4", "video/quicktime"] },
};

const extensions: Readonly<Record<string, string>> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
  "audio/aac": "aac", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
  "video/mp4": "mp4", "video/quicktime": "mov",
};

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}
function apiBaseUrl(value: string): string {
  let trimmed = value.trim();
  while (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
  assert(trimmed.length > 0, "BeatAPI base URL is empty");
  return trimmed;
}
function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  const value = credentials.apiKey?.secret;
  if (typeof value !== "string" || value.length === 0) {
    throw new BeatApiServiceError("BEATAPI_CREDENTIAL_UNAVAILABLE",
      "BeatAPI apiKey credential is unavailable; store a BeatAPI API key for this Endpoint");
  }
  return value;
}
function httpsUrl(value: unknown, subject: string): string {
  assert(typeof value === "string" && /^https:\/\//u.test(value), `${subject} has no HTTPS URL`);
  return value;
}
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function failure(error: unknown): EndpointOutcome {
  if (!(error instanceof EndpointServiceError || error instanceof EndpointHttpError
    || error instanceof EndpointTransportError || error instanceof EndpointResponseError)) throw error;
  const code = error instanceof EndpointServiceError || error instanceof EndpointHttpError ? error.code : "BEATAPI_ERROR";
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
    code: "BEATAPI_SUBMISSION_UNKNOWN",
    message: `BeatAPI submission transport failed; remote outcome is unknown: ${error.message}`,
  } } : undefined;
}

class BeatApiClient {
  constructor(readonly baseUrl: string, readonly timeout: number, readonly fetcher: typeof globalThis.fetch) {}
  async json(path: string, key: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    return await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init, signal, headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      }));
      const text = await wait(response.text());
      if (!response.ok) {
        const input = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
        throw new BeatApiHttpError(response.status, response, text, {
          method: init.method ?? "GET", path, ...(typeof input?.model === "string" ? { model: input.model } : {}),
        });
      }
      let body: unknown;
      try { body = text.length === 0 ? {} : JSON.parse(text); } catch { throw new EndpointResponseError(`BeatAPI returned invalid JSON (${response.status})`); }
      return object(object(body, "BeatAPI response").data, "BeatAPI response data");
    }, () => new EndpointTransportError("BeatAPI request timed out", { timeout: true }));
  }
  /** Upload one referenced Resource and return the HTTPS URL the task request carries. */
  async upload(artifact: BlobRef, resources: ResourceStore, key: string): Promise<string> {
    const kind = artifact.mediaType.split("/", 1)[0] ?? "";
    const limits = uploadLimits[kind];
    assert(limits !== undefined, `BeatAPI accepts image, audio and video references, not ${artifact.mediaType}`);
    assert(limits.mediaTypes.includes(artifact.mediaType),
      `BeatAPI accepts ${limits.mediaTypes.join(", ")} for ${kind} references, not ${artifact.mediaType}`);
    assert(artifact.size <= limits.bytes,
      `BeatAPI accepts ${kind} references up to ${limits.bytes / MB} MB; ${artifact.resource} is ${artifact.size} bytes`);
    const bytes = await resources.get(artifact.resource);
    assert(bytes !== undefined && bytes.byteLength === artifact.size, `Reference Resource ${artifact.resource} is unavailable or has changed`);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: artifact.mediaType }),
      `${artifact.resource}.${extensions[artifact.mediaType] ?? "bin"}`);
    form.append("purpose", "input");
    const file = await this.json("/v1/files", key, { method: "POST", body: form });
    return httpsUrl(file.url, "BeatAPI file upload");
  }
  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    return await withRequestDeadline(this.timeout, async ({ signal, wait }) => {
      const response = await wait(this.fetcher(url, { signal }));
      if (!response.ok) throw new BeatApiHttpError(response.status, response, "", { method: "GET", path: url });
      return { bytes: new Uint8Array(await wait(response.arrayBuffer())), mediaType: response.headers.get("content-type")?.split(";", 1)[0] ?? "application/octet-stream" };
    });
  }
}

function resolverFor(client: BeatApiClient, context: EndpointInvocationContext, publicAssetUrl: CreateBeatApiProviderOptions["publicAssetUrl"]): GenerationArtifactUrlResolver {
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

/** Statuses a queued image or video task passes through before it is terminal. */
const pendingStatuses: readonly string[] = ["queued", "processing"];

function endpoint(client: BeatApiClient, pollIntervalMs: number, maxOperationMs: number, publicAssetUrl: CreateBeatApiProviderOptions["publicAssetUrl"]): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const route = beatApiRouteForCapability(context.need.capability);
        assert(route !== undefined, "BeatAPI does not implement this exact capability");
        const request = route.prepare(context.need.constraints);
        await context.reportProgress?.({ phase: `Preparing BeatAPI request: ${request.model}` });
        const body = await request.compile(resolverFor(client, context, publicAssetUrl));
        await context.reportProgress?.({ phase: `Submitting BeatAPI request: ${request.model}` });
        let response: Record<string, unknown>;
        try {
          response = await client.json(`/v1/${request.media}s/tasks`, apiKey(context.credentials), {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": context.operation },
            body: JSON.stringify(body),
          });
        } catch (error) {
          const unknown = unknownSubmission(error);
          if (unknown !== undefined) return unknown;
          throw error;
        }
        if (typeof response.id !== "string" || response.id.length === 0) throw new EndpointResponseError("BeatAPI response has no task id");
        const handle: Handle = { contract: "hypit.beatapi-operation@1", taskId: response.id, route: route.key, startedAt: Date.now() };
        const receipt = { id: handle.taskId };
        await context.checkpoint?.({ status: "accepted", handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      let operationDeadlineAt: number | undefined;
      try {
        const handle = object(context.handle, "BeatAPI handle") as unknown as Handle;
        const route = beatApiRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.contract === "hypit.beatapi-operation@1" && handle.route === route.key, "BeatAPI handle is invalid");
        const receipt = { id: handle.taskId };
        operationDeadlineAt = handle.startedAt + maxOperationMs;
        if (Date.now() >= operationDeadlineAt) {
          return { status: "failed", receipt, failure: { code: "BEATAPI_OPERATION_TIMEOUT", message: `BeatAPI task ${handle.taskId} exceeded this Provider's operationTimeoutMs (${maxOperationMs}); remote outcome is unknown` } };
        }
        const task = await client.json(`/v1/tasks/${encodeURIComponent(handle.taskId)}`, apiKey(context.credentials));
        const status = String(task.status);
        if (pendingStatuses.includes(status)) {
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status }), receipt };
        }
        const rejected = beatApiTaskFailure(task, handle.taskId);
        if (rejected !== undefined) return { ...failure(rejected), receipt };
        if (status !== "succeeded") throw new EndpointResponseError(`BeatAPI returned unknown task status ${status}`);
        const media = object(task.output, "BeatAPI task output").media;
        if (!Array.isArray(media) || media.length === 0) throw new EndpointResponseError("BeatAPI task succeeded without output media");
        const urls = media.map((item, index) => httpsUrl(object(item, `BeatAPI output ${index + 1}`).url, `BeatAPI output ${index + 1}`));
        return { status: "ready", handle: canonicalize({ ...handle, urls }), receipt };
      } catch (error) {
        return retrying(error, context.handle, pollIntervalMs, operationDeadlineAt) ?? failure(error);
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "BeatAPI handle") as unknown as Handle;
        const route = beatApiRouteForCapability(context.need.capability);
        assert(route !== undefined && handle.route === route.key && Array.isArray(handle.urls), "BeatAPI collection route differs");
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

export function createBeatApiProvider(options: CreateBeatApiProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 300_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  for (const [name, value] of Object.entries({ requestTimeoutMs, operationTimeoutMs })) {
    assert(Number.isSafeInteger(value) && value > 0, `BeatAPI ${name} must be a positive integer`);
  }
  const client = new BeatApiClient(apiBaseUrl(options.baseUrl ?? "https://api.beatapi.io"), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, options.pollIntervalMs ?? 10_000, operationTimeoutMs, options.publicAssetUrl);
  return defineEndpoint({
    instance: options.instance ?? "beatapi.default", pool: options.pool ?? options.instance ?? "beatapi.default",
    pricing: { kind: "page", url: "https://docs.beatapi.io/pricing" },
    credentials: { apiKey: options.apiKey ?? credentialRef("local", "beatapi.api-key") },
    credentialInputs: { apiKey: { label: "BeatAPI API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 4,
    ...(options.actionLimits === undefined ? {} : { actionLimits: options.actionLimits }),
    capabilities: beatApiRoutes.map((route) => ({
      capability: route.capability, returns: route.returns, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: route.capability.name, supports: route.supports,
    })),
  });
}

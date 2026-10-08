import {
  EndpointHttpError,
  EndpointResponseError,
  EndpointServiceError,
  EndpointTransportError,
  defineEndpointPackage,
  pollAgainOrFail,
  transport,
  wakeAfter,
} from "@hypit/endpoint-kit";
import type {
  AsyncEndpoint,
  EndpointCredential,
  EndpointInvocationContext,
  EndpointRequest,
  EndpointOutcome,
} from "@hypit/endpoint-kit";
import {
  compileWireRequest,
  generationTypes,
  mappingSupportsRequest,
  sealGeneratedVideoSet,
} from "@hypit/generation";
import type { GenerationRequest, GenerationWireMapping } from "@hypit/generation";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";
import type { CredentialRef as RuntimeCredentialRef, ResourceStore } from "@hypit/runtime";
import { requestDeadline } from "@hypit/runtime-kit";

export const anyFastProviderModuleRef = { name: "@hypit/provider-anyfast", version: "1" } as const;
export const capability = { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2" } as const;

/**
 * AnyFast uses one ordered `content` array. The generation mapping first keeps
 * each Hypit port separate, then compilePayload applies the documented roles
 * and ordering without changing the model package's port vocabulary.
 */
export const mapping: GenerationWireMapping = {
  capability,
  result: "video",
  routes: [{ model: "seedance-2.0" }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    duration: { as: "value", field: "duration" },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "ratio" },
    generateAudio: { as: "value", field: "generate_audio" },
    webSearch: { as: "value", field: "web_search" },
    referenceImage: { as: "urlArray", field: "images", resourceFields: ["personReference"] },
    referenceVideo: { as: "urlArray", field: "videos", resourceFields: ["personReference"] },
    referenceAudio: { as: "urlArray", field: "audios" },
    firstFrame: { as: "url", field: "firstFrame", resourceFields: ["personReference"] },
    lastFrame: { as: "url", field: "lastFrame", resourceFields: ["personReference"] },
  },
};

const BASE_URL = "https://www.anyfast.ai";
const MODEL = "seedance-2.0";
const MAX_DURATION_SECONDS = 15;
const MIN_DURATION_SECONDS = 4;
const RESOLUTIONS = new Set(["480p", "720p", "1080p", "4k"]);
const RATIOS = new Set(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"]);
const PENDING_STATUSES = new Set(["NOT_START", "QUEUED", "IN_PROGRESS", "RUNNING", "PENDING"]);
const SUCCESS_STATUSES = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED"]);
const TERMINAL_FAILURES = new Set(["FAILURE", "FAILED", "ERROR", "CANCELLED", "CANCELED"]);
const INLINE_LIMITS = { image: 30 * 1024 * 1024, video: 50 * 1024 * 1024, audio: 15 * 1024 * 1024 } as const;

type Handle = {
  readonly contract: "hypit.anyfast-operation@1";
  readonly taskId: string;
  readonly startedAt: number;
  readonly url?: string;
};

export type CreateAnyFastProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  /** AnyFast host, with or without a trailing `/v1`; defaults to the documented host. */
  readonly baseUrl?: string;
  readonly apiKey?: RuntimeCredentialRef;
  readonly defaultConcurrency?: number;
  readonly actionLimits?: import("@hypit/endpoint-kit").EndpointActionLimits;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly operationTimeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
  /**
   * Publish a Resource at an HTTPS URL or an AnyFast `asset://` reference.
   * AnyFast documents URL/asset inputs for video references, while image and
   * audio references can be inlined as Base64 data URLs.
   */
  readonly publicAssetUrl?: (
    artifact: BlobRef,
    resources: ResourceStore,
    fields?: Readonly<Record<string, string | number | boolean>>,
  ) => Promise<string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown, subject: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${subject} must be non-empty text`);
  return value.trim();
}

function apiKey(credentials: Readonly<Record<string, EndpointCredential>>): string {
  return text(credentials.apiKey?.secret, "AnyFast API key");
}

function apiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/u, "");
  assert(trimmed.length > 0, "AnyFast base URL is empty");
  const url = new URL(trimmed);
  assert(url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname),
    "AnyFast base URL must use HTTPS or loopback");
  assert(url.pathname === "" || url.pathname === "/" || url.pathname === "/v1",
    "AnyFast base URL must be the service host or end in /v1");
  return url.pathname === "/v1" ? url.origin : trimmed;
}

function httpUrl(value: unknown, subject: string): string {
  const url = text(value, subject);
  const parsed = new URL(url);
  assert(parsed.protocol === "https:", `${subject} must use HTTPS`);
  return url;
}

function failure(error: unknown): EndpointOutcome {
  return {
    status: "failed",
    failure: {
      code: error instanceof EndpointServiceError ? error.code : "ANYFAST_ERROR",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function mediaKind(mediaType: string): "image" | "video" | "audio" | undefined {
  const kind = mediaType.split("/", 1)[0];
  return kind === "image" || kind === "video" || kind === "audio" ? kind : undefined;
}

function resolverFor(
  context: EndpointInvocationContext,
  publicAssetUrl: CreateAnyFastProviderOptions["publicAssetUrl"],
): (artifact: BlobRef, fields?: Readonly<Record<string, string | number | boolean>>) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (artifact, fields) => {
    // The same resource can be used in different roles with different
    // personReference fields. Do not let the first upload decide later roles.
    const cacheKey = `${artifact.resource}:${JSON.stringify(fields ?? {})}`;
    const prior = cache.get(cacheKey);
    if (prior !== undefined) return prior;
    const current = (async () => {
      const kind = mediaKind(artifact.mediaType);
      assert(kind !== undefined, `AnyFast cannot consume ${artifact.mediaType} as a reference`);
      if (publicAssetUrl !== undefined) {
        const published = await publicAssetUrl(artifact, context.resources, fields);
        const value = text(published, `AnyFast ${kind} reference URL`);
        assert(value.startsWith("asset://") || /^https:\/\//u.test(value),
          `AnyFast ${kind} reference must resolve to an HTTPS URL or asset:// reference`);
        return value;
      }
      // AnyFast documents Base64 for image/audio, but only URL or asset:// for
      // video. Do not silently send an undocumented video data URI.
      assert(kind !== "video",
        "AnyFast video references require a publicAssetUrl that returns an HTTPS or asset:// reference");
      const limit = INLINE_LIMITS[kind];
      assert(artifact.size <= limit,
        `AnyFast ${kind} references are limited to ${limit / 1_000_000} MB; ${artifact.resource} is ${artifact.size} bytes`);
      const bytes = await context.resources.get(artifact.resource);
      assert(bytes !== undefined && bytes.byteLength === artifact.size,
        `Reference Resource ${artifact.resource} is unavailable or has changed`);
      return `data:${artifact.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
    })();
    cache.set(cacheKey, current);
    return current;
  };
}

function requestPorts(request: EndpointRequest): GenerationRequest {
  return request.constraints as unknown as GenerationRequest;
}

function support(request: EndpointRequest) {
  const authored = requestPorts(request);
  if (!mappingSupportsRequest(mapping, authored)) {
    return { status: "unsupported" as const, reason: "AnyFast cannot map one of the requested Seedance inputs" };
  }
  const ports = authored.ports;
  const hasReference = ["referenceImage", "referenceVideo", "referenceAudio", "firstFrame", "lastFrame"]
    .some((name) => (ports[name]?.length ?? 0) > 0);
  if ((ports.webSearch?.[0] ?? false) === true && hasReference) {
    return { status: "unsupported" as const, reason: "AnyFast documents web_search only for text-to-video requests" };
  }
  const duration = ports.duration?.[0];
  if (typeof duration === "number" && (!Number.isInteger(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS)) {
    return { status: "unsupported" as const, reason: `AnyFast Seedance 2.0 accepts ${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS} whole seconds` };
  }
  const resolution = ports.resolution?.[0];
  if (resolution !== undefined && (typeof resolution !== "string" || !RESOLUTIONS.has(resolution.toLowerCase()))) {
    return { status: "unsupported" as const, reason: "AnyFast supports 480p, 720p, 1080p or 4k for Seedance 2.0" };
  }
  const ratio = ports.aspectRatio?.[0];
  if (ratio !== undefined && (typeof ratio !== "string" || !RATIOS.has(ratio))) {
    return { status: "unsupported" as const, reason: "AnyFast does not support this aspect ratio value" };
  }
  return { status: "supported" as const };
}

function strings(value: unknown, subject: string): string[] {
  assert(Array.isArray(value), `${subject} must be an array`);
  return value.map((item, index) => text(item, `${subject}[${index}]`));
}

function optionalString(value: unknown, subject: string): string | undefined {
  return value === undefined ? undefined : text(value, subject);
}

function compilePayload(wire: {
  readonly model: string;
  readonly input: CanonicalValue;
}): Record<string, unknown> {
  const input = object(wire.input, "AnyFast request input");
  assert(wire.model === MODEL, `AnyFast model route must be ${MODEL}`);
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: text(input.prompt, "AnyFast prompt"),
  }];
  const firstFrame = optionalString(input.firstFrame, "AnyFast first-frame URL");
  const lastFrame = optionalString(input.lastFrame, "AnyFast last-frame URL");
  const images = strings(input.images ?? [], "AnyFast image references");
  const videos = strings(input.videos ?? [], "AnyFast video references");
  const audios = strings(input.audios ?? [], "AnyFast audio references");
  if (firstFrame !== undefined) {
    content.push({ type: "image_url", image_url: { url: firstFrame }, role: "first_frame" });
    if (lastFrame !== undefined) content.push({ type: "image_url", image_url: { url: lastFrame }, role: "last_frame" });
  } else {
    for (const url of images) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    for (const url of videos) content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    for (const url of audios) content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
  }
  const payload: Record<string, unknown> = {
    model: MODEL,
    content,
    generate_audio: input.generate_audio ?? false,
    resolution: String(input.resolution ?? "720p").toLowerCase(),
    ratio: String(input.ratio ?? "9:16"),
    duration: input.duration ?? 5,
    watermark: false,
  };
  assert(typeof payload.generate_audio === "boolean", "AnyFast generate_audio must be boolean");
  assert(typeof payload.duration === "number" && Number.isInteger(payload.duration), "AnyFast duration must be an integer");
  assert(RESOLUTIONS.has(String(payload.resolution)), "AnyFast resolution is unsupported");
  assert(RATIOS.has(String(payload.ratio)), "AnyFast aspect ratio is unsupported");
  if (input.web_search === true) payload.tools = [{ type: "web_search" }];
  return payload;
}

class AnyFastClient {
  constructor(readonly baseUrl: string, readonly timeoutMs: number, readonly fetcher: typeof globalThis.fetch) {}

  async json(path: string, secret: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const deadline = requestDeadline(this.timeoutMs, () => new EndpointTransportError("AnyFast request timed out"));
    try {
      const response = await transport(deadline.wait(this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: deadline.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${secret}`,
          ...(init.headers ?? {}),
        },
      })));
      const body = await transport(deadline.wait(response.text()));
      if (!response.ok) throw new EndpointHttpError(`ANYFAST_HTTP_${response.status}`, `AnyFast returned HTTP ${response.status}`, response.status);
      try {
        return object(body.length === 0 ? {} : JSON.parse(body), "AnyFast response");
      } catch {
        throw new EndpointResponseError("AnyFast returned invalid JSON");
      }
    } finally {
      deadline.finish();
    }
  }

  async download(url: string): Promise<{ readonly bytes: Uint8Array; readonly mediaType: string }> {
    const deadline = requestDeadline(this.timeoutMs, () => new EndpointTransportError("AnyFast result download timed out"));
    try {
      // The result URL is a presigned URL. Never send the AnyFast Bearer token
      // to the result host, even if it happens to share the API hostname.
      const response = await transport(deadline.wait(this.fetcher(url, {
        signal: deadline.signal,
        headers: { accept: "video/mp4" },
      })));
      if (!response.ok) throw new EndpointHttpError(`ANYFAST_DOWNLOAD_${response.status}`, `AnyFast result returned HTTP ${response.status}`, response.status);
      return {
        bytes: new Uint8Array(await transport(deadline.wait(response.arrayBuffer()))),
        mediaType: response.headers.get("content-type")?.split(";", 1)[0]?.trim() || "video/mp4",
      };
    } finally {
      deadline.finish();
    }
  }
}

function responseData(response: Record<string, unknown>): Record<string, unknown> {
  return optionalObject(response.data) ?? response;
}

function taskId(response: Record<string, unknown>): string {
  const data = responseData(response);
  return text(response.task_id ?? response.id ?? data.task_id ?? data.id, "AnyFast task id");
}

function taskStatus(response: Record<string, unknown>): string {
  const data = responseData(response);
  const value = response.status ?? data.status ?? optionalObject(data.data)?.status;
  return text(value, "AnyFast task status").toUpperCase();
}

function taskFailureReason(response: Record<string, unknown>): string | undefined {
  const data = responseData(response);
  const nested = optionalObject(data.data);
  const value = data.fail_reason ?? nested?.fail_reason ?? response.fail_reason;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return value.trim()
    .replace(/https?:\/\/[^\s"'<>]+/giu, "<redacted-url>")
    .replace(/(bearer\s+)[^\s,;"']+/giu, "$1<redacted>")
    .slice(0, 240);
}

function outputUrl(response: Record<string, unknown>): string {
  const data = responseData(response);
  const nested = optionalObject(data.data);
  const content = optionalObject(nested?.content);
  const candidate = response.result_url
    ?? data.result_url
    ?? content?.video_url
    ?? nested?.video_url;
  return httpUrl(candidate, "AnyFast task result URL");
}

function endpoint(
  client: AnyFastClient,
  pollIntervalMs: number,
  operationTimeoutMs: number,
  publicAssetUrl: CreateAnyFastProviderOptions["publicAssetUrl"],
): AsyncEndpoint {
  return {
    async start(context) {
      try {
        const supported = support(context.need);
        if (supported.status === "unsupported") throw new AnyFastServiceError("ANYFAST_UNSUPPORTED", supported.reason);
        const authored = requestPorts(context.need);
        const wire = await compileWireRequest(mapping, authored, resolverFor(context, publicAssetUrl));
        const body = JSON.stringify(compilePayload(wire));
        await context.reportProgress?.({ phase: `Preparing AnyFast request: ${wire.model}` });
        const response = await client.json("/v1/video/generations", apiKey(context.credentials), {
          method: "POST",
          // Runtime keeps this operation id stable when an action is retried.
          // AnyFast may ignore the header today, but it gives the service a
          // deduplication key when idempotent submission is supported.
          headers: { "content-type": "application/json", "idempotency-key": context.operation },
          body,
        });
        const handle: Handle = { contract: "hypit.anyfast-operation@1", taskId: taskId(response), startedAt: Date.now() };
        const receipt = { id: handle.taskId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      try {
        const handle = object(context.handle, "AnyFast handle") as unknown as Handle;
        assert(handle.contract === "hypit.anyfast-operation@1", "AnyFast handle contract is invalid");
        const receipt = { id: handle.taskId };
        if (Date.now() - handle.startedAt > operationTimeoutMs) {
          return {
            status: "failed",
            receipt,
            failure: {
              code: "ANYFAST_OPERATION_TIMEOUT",
              message: `AnyFast task ${handle.taskId} exceeded the Provider operation timeout; remote outcome is unknown`,
            },
          };
        }
        const response = await client.json(`/v1/video/generations/${encodeURIComponent(handle.taskId)}`, apiKey(context.credentials));
        const status = taskStatus(response);
        if (PENDING_STATUSES.has(status)) {
          return { ...wakeAfter(canonicalize(handle), pollIntervalMs, Date.now(), { phase: status.toLowerCase() }), receipt };
        }
        if (TERMINAL_FAILURES.has(status)) {
          const reason = taskFailureReason(response);
          return {
            status: "failed",
            receipt,
            failure: {
              code: `ANYFAST_TASK_${status}`,
              message: `AnyFast task ${handle.taskId} ended with status ${status}${reason === undefined ? "" : `: ${reason}`}`,
            },
          };
        }
        if (!SUCCESS_STATUSES.has(status)) {
          throw new AnyFastServiceError("ANYFAST_UNKNOWN_STATUS", `AnyFast returned unknown task status ${status}`);
        }
        return { status: "ready", handle: canonicalize({ ...handle, url: outputUrl(response) }), receipt };
      } catch (error) {
        return pollAgainOrFail(error, { handle: context.handle, pollIntervalMs, failure });
      }
    },
    async collect(context) {
      try {
        const handle = object(context.handle, "AnyFast handle") as unknown as Handle;
        const url = httpUrl(handle.url, "AnyFast result URL");
        await context.reportProgress?.({ phase: "Receiving generated video" });
        const downloaded = await client.download(url);
        const artifact = await context.resources.put(downloaded.bytes, downloaded.mediaType);
        return {
          status: "completed",
          result: { value: { kind: "inline", value: canonicalize(sealGeneratedVideoSet({ videos: [artifact] })) } },
          receipt: { id: handle.taskId },
        };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export class AnyFastServiceError extends EndpointServiceError {}

export function createAnyFastProvider(options: CreateAnyFastProviderOptions = {}) {
  const requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  const operationTimeoutMs = options.operationTimeoutMs ?? 30 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 10_000;
  assert(Number.isSafeInteger(requestTimeoutMs) && requestTimeoutMs > 0, "AnyFast requestTimeoutMs must be positive");
  assert(Number.isSafeInteger(operationTimeoutMs) && operationTimeoutMs > 0, "AnyFast operationTimeoutMs must be positive");
  assert(Number.isSafeInteger(pollIntervalMs) && pollIntervalMs > 0, "AnyFast pollIntervalMs must be positive");
  const client = new AnyFastClient(apiBaseUrl(options.baseUrl ?? BASE_URL), requestTimeoutMs, options.fetch ?? globalThis.fetch);
  const asyncEndpoint = endpoint(client, pollIntervalMs, operationTimeoutMs, options.publicAssetUrl);
  return defineEndpointPackage({
    module: anyFastProviderModuleRef,
    facet: "gateway",
    instance: options.instance ?? "anyfast.seedance-2",
    pool: options.pool ?? options.instance ?? "anyfast.seedance-2",
    pricing: { kind: "page", url: "https://www.anyfast.ai/pricing" },
    credentials: { apiKey: options.apiKey ?? credentialRef("platform", "anyfast.seedance-2.api-key") },
    credentialInputs: { apiKey: { label: "AnyFast Seedance-2.0 API key" } },
    defaultConcurrency: options.defaultConcurrency ?? 1,
    ...(options.actionLimits === undefined ? { actionLimits: { submit: { concurrency: 1 }, poll: { concurrency: 4 }, collect: { concurrency: 2 } } } : { actionLimits: options.actionLimits }),
    capabilities: [{ capability, returns: generationTypes.videoSet, lifecycle: "asynchronous" as const, endpoint: asyncEndpoint, capacity: "seedance-2", supports: support }],
  });
}

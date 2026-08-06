import type {
  ProviderEndpoint,
  ProviderEndpointResumeContext,
  ProviderEndpointStartContext,
  ProviderEndpointResult,
} from "@svml/driver-node";
import {
  sealGeneratedImageSet,
  sealGeneratedVideoSet,
} from "@svml/generation";
import {
  canonicalize,
  digestOf,
  isDigest,
} from "@svml/protocol";
import type {
  BlobRef,
  CanonicalValue,
  Digest,
} from "@svml/protocol";
import {
  defineProviderPackage,
  wakeAfter,
} from "@svml/provider-kit";
import { credentialRef } from "@svml/runtime";
import type { ArtifactStore, CredentialRef } from "@svml/runtime";

import {
  kieAdapterForCapability,
  kieModelCatalog,
  verifyKieModelCatalog,
} from "./catalog.js";
import type {
  KieArtifactUrlResolver,
  KieModelAdapter,
  KieTask,
} from "./catalog.js";

export const kieProviderModuleRef = { name: "@svml/provider-kie", version: "0.0.0-dev" } as const;
export const kieProviderImplementationDigest = digestOf("@svml/provider-kie/market-endpoint@1");

type Fetch = typeof globalThis.fetch;

export type CreateKieProviderOptions = {
  readonly instance?: string;
  readonly lane?: string;
  readonly apiBaseUrl?: string;
  readonly uploadBaseUrl?: string;
  readonly apiKey?: CredentialRef;
  readonly defaultConcurrency?: number;
  readonly pollIntervalMs?: number;
  readonly submissionIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly maxOperationMs?: number;
  readonly maxArtifactBytes?: number;
  /** Required when replacing global fetch so the configured transport changes Runtime identity. */
  readonly fetchImplementationDigest?: Digest;
  readonly fetch?: Fetch;
  readonly now?: () => number;
};

type KieCheckpoint = {
  readonly contract: "svml.kie-operation@1";
  readonly taskId: string;
  readonly catalogKey: string;
  readonly model: string;
  readonly authorModel: string;
  readonly result: "image" | "video";
  readonly requestDigest: Digest;
  readonly contentRequestDigest: Digest;
  readonly requestedDurationSec?: number;
  readonly startedAt: number;
  readonly polls: number;
  readonly pollFailures: number;
};

class KieError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(code: string, message: string, options: { readonly retryable?: boolean; readonly status?: number } = {}) {
    super(message);
    this.name = "KieError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

function nonNegativeInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value >= 0, `${subject} must be a non-negative safe integer`);
  return value;
}

function baseUrl(value: string, subject: string): string {
  const url = new URL(value);
  assert(url.protocol === "https:" || url.hostname === "localhost", `${subject} must use HTTPS or localhost`);
  return url.href.replace(/\/$/u, "");
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new KieError("KIE_INVALID_RESPONSE", `${subject} is not an object`);
  return value as Record<string, unknown>;
}

function contentRequestDigest(value: unknown): Digest {
  const request = object(value, "KIE request");
  if (typeof request.requestDigest !== "string" || !isDigest(request.requestDigest)) {
    throw new KieError("KIE_INVALID_REQUEST", "KIE request has no valid content digest");
  }
  return request.requestDigest;
}

function secret(context: ProviderEndpointStartContext | ProviderEndpointResumeContext): string {
  const value = context.credentials.apiKey?.secret;
  if (value === undefined || value.length === 0) throw new KieError("KIE_MISSING_CREDENTIAL", "KIE API key is unavailable");
  return value;
}

function mediaExtension(mediaType: string): string {
  const known: Readonly<Record<string, string>> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return known[mediaType] ?? "bin";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class IntervalGate {
  #tail = Promise.resolve();
  #nextAt = 0;
  readonly #intervalMs: number;
  readonly #now: () => number;

  constructor(intervalMs: number, now: () => number) {
    this.#intervalMs = intervalMs;
    this.#now = now;
  }

  async enter(): Promise<void> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const wait = Math.max(0, this.#nextAt - this.#now());
      if (wait > 0) await delay(wait);
      this.#nextAt = this.#now() + this.#intervalMs;
    } finally {
      release();
    }
  }
}

type KieClientOptions = {
  readonly apiBaseUrl: string;
  readonly uploadBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly maxArtifactBytes: number;
  readonly fetch: Fetch;
};

class KieClient {
  readonly #options: KieClientOptions;

  constructor(options: KieClientOptions) {
    this.#options = options;
  }

  async #fetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("KIE request timed out")), this.#options.requestTimeoutMs);
    try {
      return await this.#options.fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw new KieError("KIE_NETWORK_ERROR", error instanceof Error ? error.message : "KIE network request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  async #json(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.#fetch(url, init);
    if (!response.ok) {
      throw new KieError("KIE_HTTP_ERROR", `KIE returned HTTP ${response.status}`, { status: response.status });
    }
    const text = await response.text();
    if (text.length > 2_000_000) throw new KieError("KIE_RESPONSE_TOO_LARGE", "KIE JSON response is too large");
    try {
      return object(JSON.parse(text), "KIE response");
    } catch (error) {
      if (error instanceof KieError) throw error;
      throw new KieError("KIE_INVALID_JSON", "KIE returned invalid JSON");
    }
  }

  async upload(artifact: BlobRef, artifacts: ArtifactStore, apiKey: string): Promise<string> {
    const bytes = await artifacts.get(artifact.digest);
    if (bytes === undefined) throw new KieError("KIE_ARTIFACT_MISSING", `Artifact ${artifact.digest} is unavailable`, { retryable: false });
    if (bytes.byteLength !== artifact.size) throw new KieError("KIE_ARTIFACT_SIZE_MISMATCH", `Artifact ${artifact.digest} size differs`);
    if (bytes.byteLength > this.#options.maxArtifactBytes) {
      throw new KieError("KIE_ARTIFACT_TOO_LARGE", `Artifact ${artifact.digest} exceeds the configured KIE upload limit`);
    }
    const hex = artifact.digest.slice("sha256:".length);
    const form = new FormData();
    const body = Uint8Array.from(bytes).buffer;
    form.append("file", new Blob([body], { type: artifact.mediaType }), `${hex}.${mediaExtension(artifact.mediaType)}`);
    form.append("uploadPath", `svml/${hex.slice(0, 2)}`);
    form.append("fileName", `${hex}.${mediaExtension(artifact.mediaType)}`);
    let response: Record<string, unknown>;
    try {
      response = await this.#json(`${this.#options.uploadBaseUrl}/api/file-stream-upload`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } catch (error) {
      if (error instanceof KieError) {
        throw new KieError("KIE_UPLOAD_FAILED", error.message, {
          retryable: error.status === undefined || error.status === 429 || error.status >= 500,
          ...(error.status === undefined ? {} : { status: error.status }),
        });
      }
      throw error;
    }
    const data = object(response.data, "KIE upload data");
    const url = typeof data.downloadUrl === "string" ? data.downloadUrl
      : typeof data.fileUrl === "string" ? data.fileUrl : undefined;
    if (url === undefined || new URL(url).protocol !== "https:") {
      throw new KieError("KIE_UPLOAD_INVALID", "KIE upload returned no HTTPS URL");
    }
    return url;
  }

  async createTask(task: KieTask, apiKey: string): Promise<string> {
    let response: Record<string, unknown>;
    try {
      response = await this.#json(`${this.#options.apiBaseUrl}/api/v1/jobs/createTask`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: task.model, input: task.input }),
      });
      if (response.code !== undefined && response.code !== 200) {
        const vendorMessage = typeof response.msg === "string" && response.msg.length > 0
          ? response.msg.slice(0, 500) : "KIE rejected createTask";
        throw new KieError(
          "KIE_SUBMISSION_REJECTED",
          `${vendorMessage} (KIE code ${String(response.code).slice(0, 100)})`,
        );
      }
    } catch (error) {
      if (error instanceof KieError) {
        if (error.code === "KIE_SUBMISSION_REJECTED") throw error;
        if (error.status === 429) {
          throw new KieError("KIE_RATE_LIMITED", "KIE createTask was rate limited", { retryable: true, status: 429 });
        }
        if (error.status !== undefined && error.status >= 400 && error.status < 500) {
          throw new KieError("KIE_SUBMISSION_REJECTED", error.message, { status: error.status });
        }
        // KIE does not document an idempotency key. Retrying an ambiguous createTask can double-spend.
        throw new KieError("KIE_SUBMISSION_OUTCOME_UNKNOWN", "KIE createTask outcome is unknown; automatic resubmission is disabled");
      }
      throw error;
    }
    const data = object(response.data, "KIE createTask data");
    if (typeof data.taskId !== "string" || data.taskId.length === 0) {
      throw new KieError("KIE_SUBMISSION_INVALID", "KIE createTask returned no taskId");
    }
    return data.taskId;
  }

  async taskInfo(taskId: string, apiKey: string): Promise<Record<string, unknown>> {
    const response = await this.#json(
      `${this.#options.apiBaseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: { authorization: `Bearer ${apiKey}` } },
    );
    return object(response.data, "KIE task data");
  }

  async #downloadUrl(original: string, apiKey: string): Promise<string> {
    const response = await this.#json(`${this.#options.apiBaseUrl}/api/v1/common/download-url`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: original }),
    });
    if (typeof response.data !== "string" || new URL(response.data).protocol !== "https:") {
      throw new KieError("KIE_DOWNLOAD_URL_INVALID", "KIE returned no HTTPS download URL");
    }
    return response.data;
  }

  async download(original: string, expected: "image" | "video", apiKey: string): Promise<{ bytes: Uint8Array; mediaType: string }> {
    const url = await this.#downloadUrl(original, apiKey);
    const response = await this.#fetch(url, { method: "GET" });
    if (!response.ok) throw new KieError("KIE_DOWNLOAD_FAILED", `KIE artifact download returned HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > this.#options.maxArtifactBytes) {
      throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result exceeds the configured artifact limit");
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader === undefined) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > this.#options.maxArtifactBytes) throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result is too large");
      chunks.push(bytes);
      size = bytes.byteLength;
    } else {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > this.#options.maxArtifactBytes) {
          await reader.cancel();
          throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result is too large");
        }
        chunks.push(item.value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    const header = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const fallback = expected === "image" ? "image/png" : "video/mp4";
    const mediaType = header === undefined || header === "application/octet-stream" ? fallback : header;
    if (!mediaType.startsWith(`${expected}/`)) {
      throw new KieError("KIE_RESULT_MEDIA_MISMATCH", `KIE returned ${mediaType} for ${expected} generation`);
    }
    return { bytes, mediaType };
  }
}

function resultUrls(data: Record<string, unknown>): string[] {
  let result: unknown = data.resultJson;
  if (typeof result === "string") {
    try { result = JSON.parse(result); } catch { throw new KieError("KIE_RESULT_INVALID", "KIE resultJson is invalid JSON"); }
  }
  const value = object(result, "KIE resultJson");
  const candidate = value.resultUrls ?? value.result_urls ?? value.urls;
  if (!Array.isArray(candidate) || candidate.length === 0 || candidate.some((item) => typeof item !== "string")) {
    throw new KieError("KIE_RESULT_MISSING", "KIE successful task returned no result URLs");
  }
  return candidate.map((item) => {
    const url = new URL(item as string);
    if (url.protocol !== "https:") throw new KieError("KIE_RESULT_URL_INVALID", "KIE result URL must use HTTPS");
    return url.href;
  });
}

function verifyCheckpoint(value: CanonicalValue | undefined, context: ProviderEndpointResumeContext): KieCheckpoint {
  if (value === undefined) {
    throw new KieError(
      "KIE_SUBMISSION_CHECKPOINT_MISSING",
      "KIE Operation has no task checkpoint; resubmission is disabled to avoid duplicate spend",
    );
  }
  const checkpoint = object(value, "KIE checkpoint") as unknown as KieCheckpoint;
  const adapter = kieAdapterForCapability(context.need.capability);
  if (checkpoint.contract !== "svml.kie-operation@1"
    || typeof checkpoint.taskId !== "string"
    || adapter === undefined
    || checkpoint.catalogKey !== adapter.key
    || checkpoint.requestDigest !== context.need.requestDigest
    || !isDigest(checkpoint.contentRequestDigest)
    || !Number.isSafeInteger(checkpoint.startedAt)
    || !Number.isSafeInteger(checkpoint.polls)
    || !Number.isSafeInteger(checkpoint.pollFailures)) {
    throw new KieError("KIE_CHECKPOINT_INVALID", "KIE checkpoint does not match the regenerated Need");
  }
  return checkpoint;
}

function endpoint(options: {
  readonly client: KieClient;
  readonly gate: IntervalGate;
  readonly pollIntervalMs: number;
  readonly maxOperationMs: number;
  readonly now: () => number;
}): ProviderEndpoint {
  const failure = (error: unknown): ProviderEndpointResult => {
    const known = error instanceof KieError ? error : new KieError("KIE_INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
    return {
      status: "failed",
      failure: {
        code: known.code,
        message: known.message,
        retryable: known.retryable,
        ...(known.retryable ? { retryAt: options.now() + 2_000 } : {}),
      },
    };
  };
  const pendingAfterError = (checkpoint: KieCheckpoint, error: unknown): ProviderEndpointResult => {
    const failures = checkpoint.pollFailures + 1;
    if (options.now() - checkpoint.startedAt >= options.maxOperationMs) {
      return failure(new KieError("KIE_OPERATION_TIMEOUT", "KIE task did not become durably available before the deadline"));
    }
    const delayMs = Math.min(30_000, options.pollIntervalMs * (2 ** Math.min(failures, 5)));
    return wakeAfter(canonicalize({ ...checkpoint, pollFailures: failures }), delayMs, options.now());
  };
  return {
    async start(context) {
      try {
        const adapter = kieAdapterForCapability(context.need.capability);
        if (adapter === undefined) throw new KieError("KIE_UNSUPPORTED_CAPABILITY", "KIE does not implement this exact capability");
        adapter.verify(context.need.constraints);
        const key = secret(context);
        const uploaded = new Map<Digest, Promise<string>>();
        const resolve: KieArtifactUrlResolver = (artifact) => {
          const existing = uploaded.get(artifact.digest);
          if (existing !== undefined) return existing;
          const promise = options.client.upload(artifact, context.artifacts, key);
          uploaded.set(artifact.digest, promise);
          return promise;
        };
        const task = await adapter.task(context.need.constraints, resolve);
        await options.gate.enter();
        const taskId = await options.client.createTask(task, key);
        const checkpoint: KieCheckpoint = {
          contract: "svml.kie-operation@1",
          taskId,
          catalogKey: adapter.key,
          model: task.model,
          authorModel: task.authorModel,
          result: task.result,
          requestDigest: context.need.requestDigest,
          contentRequestDigest: contentRequestDigest(context.need.constraints),
          ...(task.requestedDurationSec === undefined ? {} : { requestedDurationSec: task.requestedDurationSec }),
          startedAt: options.now(),
          polls: 0,
          pollFailures: 0,
        };
        return wakeAfter(canonicalize(checkpoint), options.pollIntervalMs, options.now());
      } catch (error) {
        return failure(error);
      }
    },
    async resume(context) {
      let checkpoint: KieCheckpoint;
      try {
        checkpoint = verifyCheckpoint(context.checkpoint, context);
      } catch (error) {
        return failure(error);
      }
      try {
        const adapter = kieAdapterForCapability(context.need.capability);
        if (adapter === undefined || adapter.key !== checkpoint.catalogKey) {
          throw new KieError("KIE_CHECKPOINT_INVALID", "KIE checkpoint capability differs");
        }
        adapter.verify(context.need.constraints);
        if (contentRequestDigest(context.need.constraints) !== checkpoint.contentRequestDigest) {
          throw new KieError("KIE_CHECKPOINT_INVALID", "KIE checkpoint request content differs");
        }
        if (options.now() - checkpoint.startedAt >= options.maxOperationMs) {
          throw new KieError("KIE_OPERATION_TIMEOUT", "KIE task exceeded its operation deadline");
        }
        const key = secret(context);
        const data = await options.client.taskInfo(checkpoint.taskId, key);
        if (typeof data.taskId === "string" && data.taskId !== checkpoint.taskId) {
          throw new KieError("KIE_TASK_ID_MISMATCH", "KIE returned another task identity");
        }
        if (typeof data.model === "string" && data.model !== checkpoint.model) {
          throw new KieError("KIE_TASK_MODEL_MISMATCH", "KIE task model differs from the submitted model");
        }
        const state = data.state;
        if (state === "waiting" || state === "queuing" || state === "generating") {
          const next = { ...checkpoint, polls: checkpoint.polls + 1, pollFailures: 0 };
          return wakeAfter(canonicalize(next), options.pollIntervalMs, options.now());
        }
        if (state === "fail") {
          const vendorCode = typeof data.failCode === "string" && data.failCode.length > 0 ? data.failCode : "unknown";
          const vendorMessage = typeof data.failMsg === "string" && data.failMsg.length > 0
            ? data.failMsg.slice(0, 500) : "KIE generation failed";
          throw new KieError("KIE_TASK_FAILED", `${vendorMessage} (${vendorCode})`);
        }
        if (state !== "success") throw new KieError("KIE_TASK_STATE_INVALID", "KIE returned an unknown task state");
        const urls = resultUrls(data);
        const limit = checkpoint.result === "image" ? 16 : 8;
        if (urls.length > limit) throw new KieError("KIE_RESULT_COUNT_EXCEEDED", "KIE returned too many result artifacts");
        const artifacts: BlobRef[] = [];
        for (const url of urls) {
          const downloaded = await options.client.download(url, checkpoint.result, key);
          artifacts.push(await context.artifacts.put(downloaded.bytes, downloaded.mediaType));
        }
        const result = checkpoint.result === "image"
          ? sealGeneratedImageSet({
              contract: "svml.generated-image-set@1",
              model: checkpoint.authorModel,
              requestDigest: checkpoint.contentRequestDigest,
              images: artifacts,
            })
          : sealGeneratedVideoSet({
              contract: "svml.generated-video-set@1",
              model: checkpoint.authorModel,
              requestDigest: checkpoint.contentRequestDigest,
              requestedDurationSec: checkpoint.requestedDurationSec ?? 0,
              videos: artifacts,
            });
        const vendorMetrics: Record<string, CanonicalValue> = {};
        for (const name of ["creditsConsumed", "costTime", "completeTime"] as const) {
          const metric = data[name];
          if (typeof metric === "number" && Number.isFinite(metric) && metric >= 0) vendorMetrics[name] = metric;
        }
        return {
          status: "completed",
          result: {
            value: { kind: "inline", value: canonicalize(result) },
            conformance: "exact",
            delivery: "executed",
            metadata: canonicalize({
              provider: "kie",
              taskId: checkpoint.taskId,
              model: checkpoint.model,
              artifacts: artifacts.map((artifact) => artifact.digest),
              ...(Object.keys(vendorMetrics).length === 0 ? {} : { metrics: vendorMetrics }),
            }),
          },
        };
      } catch (error) {
        if (error instanceof KieError && [
          "KIE_CHECKPOINT_INVALID",
          "KIE_OPERATION_TIMEOUT",
          "KIE_TASK_ID_MISMATCH",
          "KIE_TASK_MODEL_MISMATCH",
          "KIE_TASK_FAILED",
          "KIE_TASK_STATE_INVALID",
          "KIE_RESULT_COUNT_EXCEEDED",
        ].includes(error.code)) {
          return failure(error);
        }
        return pendingAfterError(checkpoint, error);
      }
    },
  };
}

export function createKieProvider(config: CreateKieProviderOptions = {}) {
  verifyKieModelCatalog();
  const apiBaseUrl = baseUrl(config.apiBaseUrl ?? "https://api.kie.ai", "apiBaseUrl");
  const uploadBaseUrl = baseUrl(config.uploadBaseUrl ?? "https://kieai.redpandaai.co", "uploadBaseUrl");
  const pollIntervalMs = nonNegativeInteger(config.pollIntervalMs ?? 3_000, "pollIntervalMs");
  const submissionIntervalMs = nonNegativeInteger(config.submissionIntervalMs ?? 500, "submissionIntervalMs");
  const requestTimeoutMs = positiveInteger(config.requestTimeoutMs ?? 30_000, "requestTimeoutMs");
  const maxOperationMs = positiveInteger(config.maxOperationMs ?? 20 * 60_000, "maxOperationMs");
  const maxArtifactBytes = positiveInteger(config.maxArtifactBytes ?? 512 * 1024 * 1024, "maxArtifactBytes");
  if (config.fetch !== undefined && config.fetchImplementationDigest === undefined) {
    throw new Error("custom KIE fetch requires fetchImplementationDigest");
  }
  if (config.fetchImplementationDigest !== undefined && !isDigest(config.fetchImplementationDigest)) {
    throw new Error("fetchImplementationDigest is invalid");
  }
  const fetchImplementationDigest = config.fetchImplementationDigest
    ?? digestOf("@svml/provider-kie/node-global-fetch@1");
  const now = config.now ?? Date.now;
  const client = new KieClient({
    apiBaseUrl,
    uploadBaseUrl,
    requestTimeoutMs,
    maxArtifactBytes,
    fetch: config.fetch ?? globalThis.fetch,
  });
  const providerEndpoint = endpoint({
    client,
    gate: new IntervalGate(submissionIntervalMs, now),
    pollIntervalMs,
    maxOperationMs,
    now,
  });
  return defineProviderPackage({
    module: kieProviderModuleRef,
    facet: "market",
    instance: config.instance ?? "kie.default",
    ...(config.lane === undefined ? {} : { lane: config.lane }),
    implementation: {
      locator: "@svml/provider-kie/market",
      digest: kieProviderImplementationDigest,
    },
    permissions: [...new Set([
      `network:${new URL(apiBaseUrl).hostname}`,
      `network:${new URL(uploadBaseUrl).hostname}`,
    ])].sort(),
    configuration: canonicalize({
      apiBaseUrl,
      uploadBaseUrl,
      pollIntervalMs,
      submissionIntervalMs,
      requestTimeoutMs,
      maxOperationMs,
      maxArtifactBytes,
      fetchImplementationDigest,
    }),
    credentials: { apiKey: config.apiKey ?? credentialRef("env", "KIE_API_KEY") },
    defaultConcurrency: config.defaultConcurrency ?? 2,
    capabilities: kieModelCatalog.map((item) => ({
      capability: item.capability,
      returns: item.returns,
      lifecycle: "recoverable" as const,
      endpoint: providerEndpoint,
      retry: { maxAttempts: 3 },
      supports: (need) => {
        try {
          item.verify(need.constraints);
          return true;
        } catch {
          return false;
        }
      },
    })),
  });
}

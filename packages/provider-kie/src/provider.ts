import type {
  RecoverableEndpoint,
  EndpointResumeContext,
  EndpointStartContext,
  EndpointOutcome,
} from "@narratage/endpoint-kit";
import {
  canonicalize,
  digestOf,
  isDigest,
} from "@narratage/protocol";
import type {
  BlobRef,
  CanonicalValue,
  Digest,
} from "@narratage/protocol";
import {
  defineEndpointPackage,
  wakeAfter,
} from "@narratage/endpoint-kit";
import { credentialRef, isStreamingArtifactStore } from "@narratage/runtime";
import type { ArtifactStore, CredentialRef } from "@narratage/runtime";

import {
  kieRouteForCapability,
  kieRoutes,
  verifyKieRoutes,
} from "./routes.js";
import type { KieTaskRequest } from "./routes.js";

export const kieProviderModuleRef = { name: "@narratage/provider-kie", version: "1" } as const;
export const kieProviderImplementationDigest = digestOf("@narratage/provider-kie/market-endpoint@1");

type Fetch = typeof globalThis.fetch;

export type CreateKieProviderOptions = {
  readonly instance?: string;
  readonly authority?: string;
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
  readonly routeKey: string;
  readonly model: string;
  readonly requestDigest: Digest;
  readonly contentRequestDigest: Digest;
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
  return digestOf(object(value, "KIE request"));
}

function secret(context: EndpointStartContext | EndpointResumeContext): string {
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
    const limit = 2_000_000;
    const reader = response.body?.getReader();
    let text: string;
    if (reader === undefined) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > limit) throw new KieError("KIE_RESPONSE_TOO_LARGE", "KIE JSON response is too large");
      text = new TextDecoder().decode(bytes);
    } else {
      const decoder = new TextDecoder();
      let size = 0;
      let decoded = "";
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > limit) {
            await reader.cancel();
            throw new KieError("KIE_RESPONSE_TOO_LARGE", "KIE JSON response is too large");
          }
          decoded += decoder.decode(item.value, { stream: true });
        }
        text = decoded + decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    try {
      return object(JSON.parse(text), "KIE response");
    } catch (error) {
      if (error instanceof KieError) throw error;
      throw new KieError("KIE_INVALID_JSON", "KIE returned invalid JSON");
    }
  }

  async upload(artifact: BlobRef, artifacts: ArtifactStore, apiKey: string): Promise<string> {
    if (artifact.size > this.#options.maxArtifactBytes) {
      throw new KieError("KIE_ARTIFACT_TOO_LARGE", `Artifact ${artifact.digest} exceeds the configured KIE upload limit`);
    }
    const hex = artifact.digest.slice("sha256:".length);
    const fileName = `${hex}.${mediaExtension(artifact.mediaType)}`;
    const boundary = `narratage-${hex}`;
    const encode = (value: string) => new TextEncoder().encode(value);
    const fileHead = encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
      + `Content-Type: ${artifact.mediaType}\r\n\r\n`,
    );
    const fields = encode(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="uploadPath"\r\n\r\nsvml/${hex.slice(0, 2)}`
      + `\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\n${fileName}`
      + `\r\n--${boundary}--\r\n`,
    );
    const source = isStreamingArtifactStore(artifacts)
      ? await artifacts.open(artifact.digest)
      : await artifacts.get(artifact.digest).then((bytes) => bytes === undefined
        ? undefined
        : (async function* () { yield bytes; })());
    if (source === undefined) {
      throw new KieError("KIE_ARTIFACT_MISSING", `Artifact ${artifact.digest} is unavailable`, { retryable: false });
    }
    const maximum = this.#options.maxArtifactBytes;
    const multipart = (async function* () {
      yield fileHead;
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of source) {
        size += chunk.byteLength;
        if (size > artifact.size || size > maximum) {
          throw new KieError("KIE_ARTIFACT_SIZE_MISMATCH", `Artifact ${artifact.digest} size differs`);
        }
        hash.update(chunk);
        yield chunk;
      }
      if (size !== artifact.size || `sha256:${hash.digest("hex")}` !== artifact.digest) {
        throw new KieError("KIE_ARTIFACT_SIZE_MISMATCH", `Artifact ${artifact.digest} bytes differ`);
      }
      yield fields;
    })();
    let response: Record<string, unknown>;
    try {
      response = await this.#json(`${this.#options.uploadBaseUrl}/api/file-stream-upload`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": String(fileHead.byteLength + artifact.size + fields.byteLength),
        },
        body: multipart as unknown as BodyInit,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
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

  async createTask(task: KieTaskRequest, apiKey: string): Promise<string> {
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

  async download(original: string, expected: "image" | "video", apiKey: string): Promise<{
    chunks: AsyncIterable<Uint8Array>;
    mediaType: string;
  }> {
    const url = await this.#downloadUrl(original, apiKey);
    const response = await this.#fetch(url, { method: "GET" });
    if (!response.ok) throw new KieError("KIE_DOWNLOAD_FAILED", `KIE artifact download returned HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > this.#options.maxArtifactBytes) {
      throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result exceeds the configured artifact limit");
    }
    const header = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const fallback = expected === "image" ? "image/png" : "video/mp4";
    const mediaType = header === undefined || header === "application/octet-stream" ? fallback : header;
    if (!mediaType.startsWith(`${expected}/`)) {
      throw new KieError("KIE_RESULT_MEDIA_MISMATCH", `KIE returned ${mediaType} for ${expected} generation`);
    }
    const maximum = this.#options.maxArtifactBytes;
    const chunks = response.body === null
      ? (async function* () {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength > maximum) throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result is too large");
          yield bytes;
        })()
      : (async function* () {
          const reader = response.body!.getReader();
          let size = 0;
          try {
            while (true) {
              const item = await reader.read();
              if (item.done) break;
              size += item.value.byteLength;
              if (size > maximum) {
                await reader.cancel();
                throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result is too large");
              }
              yield item.value;
            }
          } finally {
            reader.releaseLock();
          }
        })();
    return { chunks, mediaType };
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

function verifyCheckpoint(value: CanonicalValue | undefined, context: EndpointResumeContext): KieCheckpoint {
  if (value === undefined) {
    throw new KieError(
      "KIE_SUBMISSION_CHECKPOINT_MISSING",
      "KIE Operation has no task checkpoint; resubmission is disabled to avoid duplicate spend",
    );
  }
  const checkpoint = object(value, "KIE checkpoint") as unknown as KieCheckpoint;
  const route = kieRouteForCapability(context.need.capability);
  if (checkpoint.contract !== "svml.kie-operation@1"
    || typeof checkpoint.taskId !== "string"
    || route === undefined
    || checkpoint.routeKey !== route.key
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
}): RecoverableEndpoint {
  const failure = (error: unknown): EndpointOutcome => {
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
  const pendingAfterError = (checkpoint: KieCheckpoint, error: unknown): EndpointOutcome => {
    const failures = checkpoint.pollFailures + 1;
    if (options.now() - checkpoint.startedAt >= options.maxOperationMs) {
      return failure(new KieError("KIE_OPERATION_TIMEOUT", "KIE task did not become durably available before the deadline"));
    }
    const delayMs = Math.min(30_000, options.pollIntervalMs * (2 ** Math.min(failures, 5)));
    return wakeAfter(canonicalize({ ...checkpoint, pollFailures: failures }), delayMs, options.now(), {
      phase: "poll-retry",
    });
  };
  return {
    async start(context) {
      try {
        const route = kieRouteForCapability(context.need.capability);
        if (route === undefined) throw new KieError("KIE_UNSUPPORTED_CAPABILITY", "KIE does not implement this exact capability");
        const key = secret(context);
        const uploaded = new Map<Digest, Promise<string>>();
        const resolve = (artifact: BlobRef): Promise<string> => {
          const existing = uploaded.get(artifact.digest);
          if (existing !== undefined) return existing;
          const promise = options.client.upload(artifact, context.artifacts, key);
          uploaded.set(artifact.digest, promise);
          return promise;
        };
        const task = await route.compile(context.need.constraints, resolve);
        await options.gate.enter();
        const taskId = await options.client.createTask(task, key);
        const checkpoint: KieCheckpoint = {
          contract: "svml.kie-operation@1",
          taskId,
          routeKey: route.key,
          model: task.model,
          requestDigest: context.need.requestDigest,
          contentRequestDigest: contentRequestDigest(context.need.constraints),
          startedAt: options.now(),
          polls: 0,
          pollFailures: 0,
        };
        return wakeAfter(canonicalize(checkpoint), options.pollIntervalMs, options.now(), {
          phase: "submitted",
        });
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
        const route = kieRouteForCapability(context.need.capability);
        if (route === undefined || route.key !== checkpoint.routeKey) {
          throw new KieError("KIE_CHECKPOINT_INVALID", "KIE checkpoint capability differs");
        }
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
          return wakeAfter(canonicalize(next), options.pollIntervalMs, options.now(), {
            phase: state,
          });
        }
        if (state === "fail") {
          const vendorCode = typeof data.failCode === "string" && data.failCode.length > 0 ? data.failCode : "unknown";
          const vendorMessage = typeof data.failMsg === "string" && data.failMsg.length > 0
            ? data.failMsg.slice(0, 500) : "KIE task failed";
          throw new KieError("KIE_TASK_FAILED", `${vendorMessage} (${vendorCode})`);
        }
        if (state !== "success") throw new KieError("KIE_TASK_STATE_INVALID", "KIE returned an unknown task state");
        const urls = resultUrls(data);
        if (urls.length > route.maxResults) throw new KieError("KIE_RESULT_COUNT_EXCEEDED", "KIE returned too many result artifacts");
        const artifacts: BlobRef[] = [];
        for (const url of urls) {
          const downloaded = await options.client.download(url, route.media, key);
          if (isStreamingArtifactStore(context.artifacts)) {
            artifacts.push(await context.artifacts.putStream(downloaded.chunks, downloaded.mediaType));
          } else {
            const chunks: Uint8Array[] = [];
            let size = 0;
            for await (const chunk of downloaded.chunks) {
              chunks.push(Uint8Array.from(chunk));
              size += chunk.byteLength;
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.byteLength;
            }
            artifacts.push(await context.artifacts.put(bytes, downloaded.mediaType));
          }
        }
        const result = route.packageResult(artifacts);
        return {
          status: "completed",
          result: { value: result },
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

export function createKieProvider(config: CreateKieProviderOptions) {
  verifyKieRoutes();
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
    ?? digestOf("@narratage/provider-kie/node-global-fetch@1");
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
  return defineEndpointPackage({
    module: kieProviderModuleRef,
    facet: "market",
    instance: config.instance ?? "kie.default",
    authority: config.authority ?? config.instance ?? "kie.default",
    implementation: {
      digest: kieProviderImplementationDigest,
    },
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
    credentialInputs: { apiKey: { label: "KIE API key" } },
    defaultConcurrency: config.defaultConcurrency ?? 2,
    capabilities: kieRoutes.map((route) => ({
      capability: route.capability,
      returns: route.returns,
      lifecycle: "recoverable" as const,
      endpoint: providerEndpoint,
      retry: { maxAttempts: 3 },
    })),
  });
}
import { createHash } from "node:crypto";

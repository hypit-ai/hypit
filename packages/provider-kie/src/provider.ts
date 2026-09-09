import { requestDeadline } from "@hypit/runtime-kit";
import type {
  AsyncEndpoint,
  EndpointPollContext,
  EndpointPricingReader,
  EndpointStartContext,
  EndpointOutcome,
} from "@hypit/endpoint-kit";
import {
  canonicalize,
} from "@hypit/protocol";
import type {
  BlobRef,
  CanonicalValue,
  ResourceId,
} from "@hypit/protocol";
import {
  defineEndpointPackage,
  wakeAfter,
} from "@hypit/endpoint-kit";
import { credentialRef, isStreamingResourceStore } from "@hypit/runtime";
import type { ResourceStore, CredentialRef } from "@hypit/runtime";

import {
  kieRouteForCapability,
  kieRoutes,
  verifyKieRoutes,
} from "./routes.js";
import type { KieTaskRequest } from "./routes.js";

export const kieProviderModuleRef = { name: "@hypit/provider-kie", version: "1" } as const;

type Fetch = typeof globalThis.fetch;

export type CreateKieProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly apiBaseUrl?: string;
  readonly uploadBaseUrl?: string;
  readonly apiKey?: CredentialRef;
  /** Total in-flight capacity shared by every KIE lane. */
  readonly defaultConcurrency?: number;
  /** Optional KIE lane limits keyed by capability name, for example seedance-2.5. */
  readonly capabilityConcurrency?: Readonly<Record<string, number>>;
  readonly pollIntervalMs?: number;
  readonly actionLimits?: import("@hypit/endpoint-kit").EndpointActionLimits;
  readonly requestTimeoutMs?: number;
  readonly maxOperationMs?: number;
  readonly maxArtifactBytes?: number;
  readonly fetch?: Fetch;
  readonly now?: () => number;
};

type KieHandle = {
  readonly taskId: string;
  readonly routeKey: string;
  readonly startedAt: number;
};

class KieError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, options: { readonly status?: number } = {}) {
    super(message);
    this.name = "KieError";
    this.code = code;
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

function secret(context: EndpointStartContext | EndpointPollContext): string {
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

type KieClientOptions = {
  readonly apiBaseUrl: string;
  readonly uploadBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly maxArtifactBytes: number;
  readonly fetch: Fetch;
};

class KieClient {
  readonly #options: KieClientOptions;
  readonly #pricingRecords = new Map<string, Promise<readonly Record<string, unknown>[]>>();

  constructor(options: KieClientOptions) {
    this.#options = options;
  }

  async #open(url: string, init: RequestInit): Promise<{
    readonly response: Response;
    readonly wait: <T>(work: Promise<T>) => Promise<T>;
    readonly finish: () => void;
  }> {
    const deadline = requestDeadline(this.#options.requestTimeoutMs, () => new KieError("KIE_REQUEST_TIMEOUT", "KIE request timed out"));
    const { wait, finish } = deadline;
    try {
      const response = await wait(this.#options.fetch(url, { ...init, signal: deadline.signal }));
      return { response, wait, finish };
    } catch (error) {
      finish();
      if (error instanceof KieError) throw error;
      throw new KieError("KIE_NETWORK_ERROR", error instanceof Error ? error.message : "KIE network request failed");
    }
  }

  async #json(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const opened = await this.#open(url, init);
    try {
      const response = opened.response;
      if (!response.ok) {
        throw new KieError("KIE_HTTP_ERROR", `KIE returned HTTP ${response.status}`, { status: response.status });
      }
      const limit = 2_000_000;
      const reader = response.body?.getReader();
      let text: string;
      if (reader === undefined) {
        const bytes = new Uint8Array(await opened.wait(response.arrayBuffer()));
        if (bytes.byteLength > limit) throw new KieError("KIE_RESPONSE_TOO_LARGE", "KIE JSON response is too large");
        text = new TextDecoder().decode(bytes);
      } else {
        const decoder = new TextDecoder();
        let size = 0;
        let decoded = "";
        try {
          while (true) {
            const item = await opened.wait(reader.read());
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
    } catch (error) {
      if (error instanceof KieError) throw error;
      throw new KieError("KIE_NETWORK_ERROR", error instanceof Error ? error.message : "KIE network request failed");
    } finally {
      opened.finish();
    }
  }

  get pricingSource(): string {
    return `${this.#options.apiBaseUrl}/client/v1/model-pricing/page`;
  }

  async pricingRecords(model: string): Promise<readonly Record<string, unknown>[]> {
    let pending = this.#pricingRecords.get(model);
    if (pending === undefined) {
      pending = (async () => {
        const records: Record<string, unknown>[] = [];
        let page = 1;
        let pages = 1;
        while (page <= pages) {
          const response = await this.#json(this.pricingSource, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pageNum: page, pageSize: 100, modelDescription: model, interfaceType: "" }),
          });
          assert(response.code === 200, "KIE pricing service rejected the rate-card request");
          const data = object(response.data, "KIE pricing data");
          assert(Array.isArray(data.records), "KIE pricing data contains no records array");
          for (const value of data.records) records.push(object(value, "KIE pricing record"));
          const reportedPages = data.pages;
          assert(typeof reportedPages === "number" && Number.isSafeInteger(reportedPages)
            && reportedPages >= 0 && reportedPages <= 100, "KIE pricing page count is invalid");
          pages = reportedPages;
          page += 1;
        }
        return records;
      })();
      this.#pricingRecords.set(model, pending);
    }
    return await pending;
  }

  async upload(artifact: BlobRef, resources: ResourceStore, apiKey: string): Promise<string> {
    if (artifact.size > this.#options.maxArtifactBytes) {
      throw new KieError("KIE_ARTIFACT_TOO_LARGE", `Artifact ${artifact.resource} exceeds the configured KIE upload limit`);
    }
    const fileName = `${artifact.resource}.${mediaExtension(artifact.mediaType)}`;
    const boundary = `hypit-${artifact.resource}`;
    const encode = (value: string) => new TextEncoder().encode(value);
    const fileHead = encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
      + `Content-Type: ${artifact.mediaType}\r\n\r\n`,
    );
    const fields = encode(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="uploadPath"\r\n\r\nhypit/resources`
      + `\r\n--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\n${fileName}`
      + `\r\n--${boundary}--\r\n`,
    );
    const source = isStreamingResourceStore(resources)
      ? await resources.open(artifact.resource)
      : await resources.get(artifact.resource).then((bytes) => bytes === undefined
        ? undefined
        : (async function* () { yield bytes; })());
    if (source === undefined) {
      throw new KieError("KIE_ARTIFACT_MISSING", `Artifact ${artifact.resource} is unavailable`);
    }
    const maximum = this.#options.maxArtifactBytes;
    const multipart = (async function* () {
      yield fileHead;
      let size = 0;
      for await (const chunk of source) {
        size += chunk.byteLength;
        if (size > artifact.size || size > maximum) {
          throw new KieError("KIE_ARTIFACT_SIZE_MISMATCH", `Artifact ${artifact.resource} size differs`);
        }
        yield chunk;
      }
      if (size !== artifact.size) {
        throw new KieError("KIE_ARTIFACT_SIZE_MISMATCH", `Artifact ${artifact.resource} size differs`);
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
          throw new KieError("KIE_RATE_LIMITED", "KIE createTask was rate limited", { status: 429 });
        }
        if (error.status !== undefined && error.status >= 400 && error.status < 500) {
          throw new KieError("KIE_SUBMISSION_REJECTED", error.message, { status: error.status });
        }
        throw new KieError("KIE_SUBMISSION_FAILED", error.message,
          error.status === undefined ? {} : { status: error.status });
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
    const opened = await this.#open(url, { method: "GET" });
    let handedOff = false;
    try {
      const response = opened.response;
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
      const finish = opened.finish;
      const chunks = response.body === null
        ? (async function* () {
            try {
              const bytes = new Uint8Array(await opened.wait(response.arrayBuffer()));
              if (bytes.byteLength > maximum) throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result is too large");
              yield bytes;
            } catch (error) {
              if (error instanceof KieError) throw error;
              throw new KieError("KIE_NETWORK_ERROR", error instanceof Error ? error.message : "KIE result download failed");
            } finally {
              finish();
            }
          })()
        : (async function* () {
            const reader = response.body!.getReader();
            let size = 0;
            try {
              while (true) {
                const item = await opened.wait(reader.read());
                if (item.done) break;
                size += item.value.byteLength;
                if (size > maximum) {
                  await reader.cancel();
                  throw new KieError("KIE_ARTIFACT_TOO_LARGE", "KIE result is too large");
                }
                yield item.value;
              }
            } catch (error) {
              if (error instanceof KieError) throw error;
              throw new KieError("KIE_NETWORK_ERROR", error instanceof Error ? error.message : "KIE result download failed");
            } finally {
              reader.releaseLock();
              finish();
            }
          })();
      handedOff = true;
      return { chunks, mediaType };
    } finally {
      if (!handedOff) opened.finish();
    }
  }
}

function kiePricingReader(client: KieClient): EndpointPricingReader {
  return async ({ request }) => {
    const route = kieRouteForCapability(request.capability);
    if (route === undefined) return [];
    const selectedModel = route.selectModel(request);
    const records = await client.pricingRecords(selectedModel);
    if (records.length === 0) return [];
    const lines = records.map((record) => {
      if (typeof record.modelDescription !== "string" || typeof record.creditUnit !== "string") return undefined;
      const value = (item: unknown) => typeof item === "string" || typeof item === "number" ? String(item) : undefined;
      const usd = value(record.usdPrice);
      const credits = value(record.creditPrice);
      if (usd === undefined && credits === undefined) return undefined;
      const amounts = [usd === undefined ? undefined : `USD ${usd}`, credits === undefined ? undefined : `${credits} credits`];
      return `${record.modelDescription}: ${amounts.filter((item) => item !== undefined).join("; ")} (${record.creditUnit})`;
    });
    return [{
      source: client.pricingSource,
      data: canonicalize({ model: selectedModel, records }),
      ...(lines.every((line) => line !== undefined) ? { summary: lines.join("\n") } : {}),
    }];
  };
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

function readHandle(value: CanonicalValue | undefined, context: EndpointPollContext): KieHandle {
  if (value === undefined) {
    throw new KieError(
      "KIE_SUBMISSION_HANDLE_MISSING",
      "KIE Operation has no task handle",
    );
  }
  const handle = object(value, "KIE handle") as unknown as KieHandle;
  const route = kieRouteForCapability(context.need.capability);
  if (typeof handle.taskId !== "string"
    || route === undefined
    || handle.routeKey !== route.key
    || !Number.isSafeInteger(handle.startedAt)) {
    throw new KieError("KIE_HANDLE_INVALID", "KIE handle does not match the current Need");
  }
  return handle;
}

function endpoint(options: {
  readonly client: KieClient;
  readonly pollIntervalMs: number;
  readonly maxOperationMs: number;
  readonly now: () => number;
}): AsyncEndpoint {
  const failure = (error: unknown): EndpointOutcome => {
    const known = error instanceof KieError ? error : new KieError("KIE_INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
    return {
      status: "failed",
      failure: {
        code: known.code,
        message: known.message,
      },
    };
  };
  return {
    async start(context) {
      try {
        const route = kieRouteForCapability(context.need.capability);
        if (route === undefined) throw new KieError("KIE_UNSUPPORTED_CAPABILITY", "KIE does not implement this exact capability");
        const key = secret(context);
        const uploaded = new Map<ResourceId, Promise<string>>();
        const resolve = (artifact: BlobRef): Promise<string> => {
          const existing = uploaded.get(artifact.resource);
          if (existing !== undefined) return existing;
          const promise = options.client.upload(artifact, context.resources, key);
          uploaded.set(artifact.resource, promise);
          return promise;
        };
        const task = await route.compile(context.need.constraints, resolve);
        const taskId = await options.client.createTask(task, key);
        const handle: KieHandle = {
          taskId,
          routeKey: route.key,
          startedAt: options.now(),
        };
        const receipt = { id: taskId };
        await context.checkpoint?.({ handle: canonicalize(handle), receipt });
        return { ...wakeAfter(canonicalize(handle), options.pollIntervalMs, options.now(), { phase: "submitted" }), receipt };
      } catch (error) {
        return failure(error);
      }
    },
    async poll(context) {
      let handle: KieHandle;
      try {
        handle = readHandle(context.handle, context);
      } catch (error) {
        throw error;
      }
      try {
        const route = kieRouteForCapability(context.need.capability);
        if (route === undefined || route.key !== handle.routeKey) {
          throw new KieError("KIE_HANDLE_INVALID", "KIE handle capability differs");
        }
        if (options.now() - handle.startedAt >= options.maxOperationMs) {
          throw new KieError("KIE_OPERATION_TIMEOUT", "KIE task exceeded its operation deadline");
        }
        const key = secret(context);
        const data = await options.client.taskInfo(handle.taskId, key);
        const state = data.state;
        if (state === "waiting" || state === "queuing" || state === "generating") {
          return wakeAfter(canonicalize(handle), options.pollIntervalMs, options.now(), {
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
        return { status: "ready", handle: canonicalize({ ...handle, urls }), receipt: { id: handle.taskId } };
      } catch (error) {
        return failure(error);
      }
    },
    async collect(context) {
      readHandle(context.handle, context);
      const route = kieRouteForCapability(context.need.capability)!;
      const raw = object(context.handle, "KIE handle");
      const urls = raw.urls;
      if (!Array.isArray(urls) || !urls.every((url) => typeof url === "string")) throw new KieError("KIE_HANDLE_INVALID", "KIE collection has no artifact addresses");
      const key = secret(context);
      const artifacts: BlobRef[] = [];
      for (const url of urls) {
        const downloaded = await options.client.download(url, route.media, key);
        if (isStreamingResourceStore(context.resources)) {
          artifacts.push(await context.resources.putStream(downloaded.chunks, downloaded.mediaType));
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
          artifacts.push(await context.resources.put(bytes, downloaded.mediaType));
        }
      }
      const result = route.packageResult(artifacts);
      return {
        status: "completed",
        result: { value: result },
      };
    },

  };
}

export function createKieProvider(config: CreateKieProviderOptions) {
  verifyKieRoutes();
  const capacityNames = new Set(kieRoutes.map((route) => route.capability.name));
  const capabilityConcurrency = Object.fromEntries(Object.entries(config.capabilityConcurrency ?? {}).map(([capability, limit]) => {
    if (!capacityNames.has(capability)) throw new Error(`unknown KIE capacity ${capability}`);
    return [capability, positiveInteger(limit, `${capability} capabilityConcurrency`)];
  }));
  const apiBaseUrl = baseUrl(config.apiBaseUrl ?? "https://api.kie.ai", "apiBaseUrl");
  const uploadBaseUrl = baseUrl(config.uploadBaseUrl ?? "https://kieai.redpandaai.co", "uploadBaseUrl");
  const pollIntervalMs = nonNegativeInteger(config.pollIntervalMs ?? 3_000, "pollIntervalMs");
  const requestTimeoutMs = positiveInteger(config.requestTimeoutMs ?? 30_000, "requestTimeoutMs");
  const maxOperationMs = positiveInteger(config.maxOperationMs ?? 20 * 60_000, "maxOperationMs");
  const maxArtifactBytes = positiveInteger(config.maxArtifactBytes ?? 512 * 1024 * 1024, "maxArtifactBytes");
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
    pollIntervalMs,
    maxOperationMs,
    now,
  });
  return defineEndpointPackage({
    module: kieProviderModuleRef,
    facet: "market",
    instance: config.instance ?? "kie.default",
    pool: config.pool ?? config.instance ?? "kie.default",
    pricing: { kind: "page", url: "https://kie.ai/pricing" },
    readPricing: kiePricingReader(client),
    credentials: { apiKey: config.apiKey ?? credentialRef("env", "KIE_API_KEY") },
    credentialInputs: { apiKey: { label: "KIE API key" } },
    defaultConcurrency: config.defaultConcurrency ?? 10,
    ...(config.actionLimits === undefined ? {} : { actionLimits: config.actionLimits }),
    capabilities: kieRoutes.map((route) => ({
      capability: route.capability,
      returns: route.returns,
      capacity: route.capability.name,
      ...(capabilityConcurrency[route.capability.name] === undefined
        ? {}
        : { maxConcurrency: capabilityConcurrency[route.capability.name] }),
      lifecycle: "asynchronous" as const,
      endpoint: providerEndpoint,
      ...(route.supports === undefined ? {} : { supports: route.supports }),
    })),
  });
}

import { canonicalize, defineEndpointPackage, wakeAfter } from "@hypit/hypit/endpoint-kit";
import type { AsyncEndpoint, CredentialRef, EndpointRequest } from "@hypit/hypit/endpoint-kit";
import {
  compileWireRequest, generationTypes, mappingSupportsRequest,
  sealGeneratedVideoSet, selectWireModelForRequest,
} from "@hypit/hypit/generation";
import type { GenerationRequest, GenerationWireMapping } from "@hypit/hypit/generation";

export const providerModule = { name: "@example/provider-videos", version: "1" } as const;
export const capability = { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2-mini" } as const;

// This example service implements only this subset of the model. Its API is described in README.
export const mapping: GenerationWireMapping = {
  capability, result: "video", routes: [{ model: "seedance-2-mini" }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    duration: { as: "value", field: "duration" },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "ratio" },
    generateAudio: { as: "value", field: "audio" },
    webSearch: { as: "value", field: "search" },
    referenceImage: { as: "itemObject", field: "references", urlKey: "url", fieldKeys: { personReference: "person" } },
    referenceVideo: { as: "itemObject", field: "videoReferences", urlKey: "url", fieldKeys: { personReference: "person" } },
    referenceAudio: { as: "urlArray", field: "audioReferences" },
    firstFrame: { as: "url", field: "firstFrame", resourceFields: ["personReference"] },
    lastFrame: { as: "url", field: "lastFrame", resourceFields: ["personReference"] },
  },
};

// This service renders a narrower band than the model vocabulary allows, which it reports rather
// than widening: Seedance 2 Mini declares 480p/720p and 4–15 seconds, and this service renders 720p
// up to 10 seconds. The Model is unchanged; the difference belongs to this Endpoint.
const SUPPORTED_RESOLUTION = "720p";
const SUPPORTED_SECONDS = 10;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected service object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Expected nonempty service text");
  return value;
}
// This illustrative service documents these fields as its public failure evidence.
function publicFailure(value: unknown): { code: string; message: string } | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const error = value as Record<string, unknown>;
  if (typeof error.code !== "string" || typeof error.message !== "string") return undefined;
  return { code: error.code, message: error.message.replace(/https?:\/\/\S+/giu, "[redacted-url]") };
}
function address(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Service URLs require HTTPS or loopback HTTP");
  }
  return url.href;
}

function serviceSupport(request: EndpointRequest) {
  const ports = (request.constraints as unknown as GenerationRequest).ports;
  const duration = ports.duration?.[0];
  if (typeof duration === "number" && duration > SUPPORTED_SECONDS) {
    return { status: "unsupported" as const,
      reason: `This service renders at most ${SUPPORTED_SECONDS} seconds, not ${duration}` };
  }
  const resolution = ports.resolution?.[0];
  if (resolution !== undefined && String(resolution) !== SUPPORTED_RESOLUTION) {
    return { status: "unsupported" as const,
      reason: `This service renders at ${SUPPORTED_RESOLUTION}, not ${String(resolution)}` };
  }
  return mappingSupportsRequest(mapping, request.constraints)
    ? { status: "supported" as const }
    : { status: "unsupported" as const, reason: "This service does not accept one of the requested inputs" };
}

export function createVideoProvider(options: {
  instance: string; pool: string; baseUrl: string; apiKey: CredentialRef;
  concurrency?: number; pollIntervalMs?: number; fetch?: typeof globalThis.fetch;
}) {
  const base = address(options.baseUrl).replace(/\/$/u, "");
  const fetcher = options.fetch ?? globalThis.fetch;
  const interval = options.pollIntervalMs ?? 5_000;
  const key = (credentials: Readonly<Record<string, { secret: string }>>) => text(credentials.apiKey?.secret);
  async function json(path: string, secret: string, init: RequestInit = {}) {
    const response = await fetcher(`${base}${path}`, {
      ...init, headers: { ...init.headers, authorization: `Bearer ${secret}` },
      // Submission enqueues a remote job and answers immediately; the bound is for the API, not the render.
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      let error: ReturnType<typeof publicFailure>;
      try { error = publicFailure(object(await response.json()).error); }
      catch { /* A missing public error body leaves the HTTP evidence intact. */ }
      const requestId = response.headers.get("x-request-id");
      throw Object.assign(new Error(`Video service ${init.method ?? "GET"} ${path} returned HTTP ${response.status}`
        + (requestId === null ? "" : `; request=${requestId}`)
        + (error === undefined ? "" : `; ${error.code}: ${error.message}`)),
      error === undefined ? {} : { code: error.code });
    }
    return object(await response.json());
  }
  const endpoint: AsyncEndpoint = {
    async start(context) {
      const supported = serviceSupport(context.need);
      if (supported.status === "unsupported") throw new Error(supported.reason);
      const secret = key(context.credentials);
      const authored = context.need.constraints as unknown as GenerationRequest;
      const model = selectWireModelForRequest(mapping, authored);
      // This service has no catalogue query; its known request limits were checked above.
      await context.reportProgress?.({ phase: `Preparing video request: ${model}` });
      const request = await compileWireRequest(mapping, authored,
        async (artifact, fields) => {
          const bytes = await context.resources.get(artifact.resource);
          if (bytes === undefined) throw new Error("Reference media is unavailable");
          const upload = await fetcher(`${base}/uploads`, {
            method: "POST", headers: { "content-type": artifact.mediaType, authorization: `Bearer ${secret}`,
              ...(fields?.personReference === undefined ? {} : { "x-person-reference": String(fields.personReference) }),
            },
            body: new Blob([new Uint8Array(bytes)]), signal: AbortSignal.timeout(120_000),
          });
          if (!upload.ok) throw new Error(`Video service POST /uploads returned HTTP ${upload.status}`);
          return address(text(object(await upload.json()).url));
        });
      await context.reportProgress?.({ phase: `Submitting video request: ${model}` });
      const task = await json("/videos", secret, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
      });
      const id = text(task.id), handle = { id }, receipt = { id };
      await context.checkpoint?.({ handle, receipt });
      return { ...wakeAfter(handle, interval), receipt };
    },
    async poll(context) {
      const id = text(object(context.handle).id);
      const task = await json(`/videos/${encodeURIComponent(id)}`, key(context.credentials));
      const status = text(task.status);
      if (status === "queued" || status === "running") {
        return wakeAfter({ id }, interval, Date.now(), { phase: status });
      }
      if (status === "failed") {
        const error = publicFailure(task.error);
        return { status: "failed", receipt: { id }, failure: {
          code: error?.code ?? "VIDEO_SERVICE_FAILED",
          message: `Video service task ${id} failed${error === undefined ? "" : `: ${error.message}`}`,
        } };
      }
      if (status !== "succeeded") throw new Error("Video service returned an unknown task state");
      // A completed task without a result URL is a service contract violation, not a pending job.
      return { status: "ready", handle: { id, url: address(text(task.output)) } };
    },
    async collect(context) {
      // The service returns a signed asset URL; account credentials go only to its API.
      const url = address(text(object(context.handle).url));
      await context.reportProgress?.({ phase: "Receiving generated video" });
      // One delivered video is bounded here; a larger file belongs with a streaming resource port.
      const response = await fetcher(url, { signal: AbortSignal.timeout(600_000) });
      if (!response.ok) throw new Error(`Video download returned HTTP ${response.status}`);
      const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim();
      if (!mediaType?.startsWith("video/")) throw new Error("Video service returned a non-video result");
      const artifact = await context.resources.put(new Uint8Array(await response.arrayBuffer()), mediaType);
      return { status: "completed", result: { value: {
        kind: "inline", value: canonicalize(sealGeneratedVideoSet({ videos: [artifact] })),
      } } };
    },
  };
  return defineEndpointPackage({
    module: providerModule, facet: "videos", instance: options.instance, pool: options.pool,
    credentials: { apiKey: options.apiKey }, credentialInputs: { apiKey: { label: "Video service API key" } },
    defaultConcurrency: options.concurrency ?? 1,
    actionLimits: { submit: { concurrency: 1 }, poll: { concurrency: 4 }, collect: { concurrency: 2 } },
    pricing: { kind: "page", url: `${base}/pricing` },
    async readPricing(context) {
      const model = selectWireModelForRequest(mapping, context.request.constraints as unknown as GenerationRequest,
        context.request.pendingInputs?.map((input) => input.input));
      const path = `/rates?model=${encodeURIComponent(model)}`;
      const source = `${base}${path}`;
      const rates = await json(path, key(await context.credentials()));
      return [{ source, data: canonicalize(rates), summary: text(rates.description) }];
    },
    capabilities: [{ capability, returns: generationTypes.videoSet, lifecycle: "asynchronous", supports: serviceSupport, endpoint }],
  });
}

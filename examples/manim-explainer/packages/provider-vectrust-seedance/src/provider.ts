import { canonicalize, defineEndpoint, wakeAfter } from "@hypit/hypit/endpoint";
import type { AsyncEndpoint, CredentialRef, EndpointRequest } from "@hypit/hypit/endpoint";
import {
  compileWireRequest,
  generationTypes,
  mappingSupportsRequest,
  sealGeneratedVideoSet,
  selectWireModelForRequest,
} from "@hypit/hypit/generation";
import type { GenerationRequest, GenerationWireMapping } from "@hypit/hypit/generation";

export const providerModule = { name: "@project/provider-vectrust-seedance", version: "1" } as const;
export const capability = { module: { name: "@hypit/seedance", version: "1" }, name: "seedance-2" } as const;

export const mapping: GenerationWireMapping = {
  capability,
  result: "video",
  routes: [{ model: "doubao-seedance-2-0-260128" }],
  fields: {
    prompt: { as: "value", field: "text" },
    duration: { as: "value", field: "duration" },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "ratio" },
    generateAudio: { as: "value", field: "generate_audio" },
    webSearch: { as: "value", field: "web_search" },
    referenceImage: { as: "urlArray", field: "reference_image", resourceFields: ["personReference"] },
    referenceVideo: { as: "urlArray", field: "reference_video", resourceFields: ["personReference"] },
    referenceAudio: { as: "urlArray", field: "reference_audio" },
    firstFrame: { as: "url", field: "first_frame", resourceFields: ["personReference"] },
    lastFrame: { as: "url", field: "last_frame", resourceFields: ["personReference"] },
  },
};

const SUPPORTED_RESOLUTION = "720p";
const SUPPORTED_RATIO = "9:16";

function object(value: unknown, subject = "service value"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${subject} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, subject = "service text"): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${subject} must be nonempty text`);
  return value;
}

function serviceObject(value: unknown): Record<string, unknown> {
  const response = object(value, "service response");
  return response.data !== undefined ? object(response.data, "service response data") : response;
}

function publicFailure(value: unknown): { code: string; message: string } | undefined {
  if (typeof value === "string" && value.length > 0) {
    return { code: "VIDEO_SERVICE_FAILED", message: value.replace(/https?:\/\/\S+/giu, "[redacted-url]") };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const error = value as Record<string, unknown>;
  const code = typeof error.code === "string" ? error.code : "VIDEO_SERVICE_FAILED";
  const message = typeof error.message === "string" ? error.message : typeof error.error === "string" ? error.error : undefined;
  return message === undefined ? undefined : { code, message: message.replace(/https?:\/\/\S+/giu, "[redacted-url]") };
}

function address(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Service URLs require HTTPS or loopback HTTP");
  }
  return url.href;
}

function scalar(request: GenerationRequest, port: string): string | number | boolean | undefined {
  const value = request.ports[port]?.[0];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

function serviceSupport(request: EndpointRequest) {
  const authored = request.constraints as unknown as GenerationRequest;
  const duration = scalar(authored, "duration");
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 4 || duration > 15) {
    return { status: "unsupported" as const, reason: `This service requires an integer duration from 4 to 15 seconds, not ${String(duration)}` };
  }
  const resolution = scalar(authored, "resolution");
  if (resolution !== SUPPORTED_RESOLUTION) {
    return { status: "unsupported" as const, reason: `This service renders at ${SUPPORTED_RESOLUTION}, not ${String(resolution)}` };
  }
  const ratio = scalar(authored, "aspectRatio");
  if (ratio !== SUPPORTED_RATIO) {
    return { status: "unsupported" as const, reason: `This Endpoint is configured for ${SUPPORTED_RATIO}, not ${String(ratio)}` };
  }
  return mappingSupportsRequest(mapping, request.constraints)
    ? { status: "supported" as const }
    : { status: "unsupported" as const, reason: "This service does not accept one of the requested inputs" };
}

function dataUrl(bytes: Uint8Array, mediaType: string): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function urls(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function mediaContent(type: "image_url" | "video_url" | "audio_url", url: string, role: string) {
  return { type, [type]: { url }, role };
}

export function compileServiceBody(model: string, input: Record<string, unknown>) {
  return {
    model,
    content: [
      { type: "text", text: input.text },
      ...(typeof input.first_frame === "string" ? [mediaContent("image_url", input.first_frame, "first_frame")] : []),
      ...(typeof input.last_frame === "string" ? [mediaContent("image_url", input.last_frame, "last_frame")] : []),
      ...urls(input.reference_image).map((url) => mediaContent("image_url", url, "reference_image")),
      ...urls(input.reference_video).map((url) => mediaContent("video_url", url, "reference_video")),
      ...urls(input.reference_audio).map((url) => mediaContent("audio_url", url, "reference_audio")),
    ],
    duration: input.duration,
    resolution: input.resolution,
    ratio: input.ratio,
    generate_audio: input.generate_audio,
    watermark: false,
  };
}

export function createVectrustSeedanceProvider(options: {
  instance: string;
  pool: string;
  baseUrl: string;
  apiKey: CredentialRef;
  concurrency?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}) {
  const base = address(options.baseUrl).replace(/\/$/u, "");
  const fetcher = options.fetch ?? globalThis.fetch;
  const interval = options.pollIntervalMs ?? 10_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 600_000;
  const key = (credentials: Readonly<Record<string, { secret: string }>>) => text(credentials.apiKey?.secret, "API key");

  async function json(path: string, secret: string, init: RequestInit = {}) {
    const response = await fetcher(`${base}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      let error: ReturnType<typeof publicFailure>;
      try {
        const body = object(await response.json(), "error response");
        error = publicFailure(body.error ?? body.message);
      } catch {
        error = undefined;
      }
      const requestId = response.headers.get("x-request-id");
      throw Object.assign(
        new Error(`Video service ${init.method ?? "GET"} ${path} returned HTTP ${response.status}`
          + (requestId === null ? "" : `; request=${requestId}`)
          + (error === undefined ? "" : `; ${error.code}: ${error.message}`)),
        error === undefined ? {} : { code: error.code },
      );
    }
    return serviceObject(await response.json());
  }

  const endpoint: AsyncEndpoint = {
    async start(context) {
      const supported = serviceSupport(context.need);
      if (supported.status === "unsupported") throw new Error(supported.reason);
      const authored = context.need.constraints as unknown as GenerationRequest;
      const model = selectWireModelForRequest(mapping, authored);
      await context.reportProgress?.({ phase: `Preparing Seedance request: ${model}` });
      const wire = await compileWireRequest(mapping, authored, async (artifact) => {
        const bytes = await context.resources.get(artifact.resource);
        if (bytes === undefined || bytes.byteLength !== artifact.size) throw new Error("Reference media is unavailable or changed");
        return dataUrl(new Uint8Array(bytes), artifact.mediaType);
      });
      const body = compileServiceBody(wire.model, wire.input as Record<string, unknown>);
      await context.reportProgress?.({ phase: `Submitting Seedance request: ${model}` });
      const task = await json("/seedance/api/v3/contents/generations/tasks", key(context.credentials), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const id = text(task.id ?? task.task_id, "task id");
      const handle = { id };
      const receipt = { id };
      await context.checkpoint?.({ handle, receipt });
      return { ...wakeAfter(handle, interval), receipt };
    },
    async poll(context) {
      const id = text(object(context.handle, "task handle").id, "task id");
      const task = await json(`/seedance/api/v3/contents/generations/tasks/${encodeURIComponent(id)}`, key(context.credentials));
      const status = text(task.status, "task status").toLowerCase();
      if (["pending", "queued", "processing", "running", "in_progress"].includes(status)) {
        return wakeAfter({ id }, interval, Date.now(), { phase: status });
      }
      if (["failed", "failure", "canceled", "cancelled", "expired"].includes(status)) {
        const error = publicFailure(task.error ?? task.failure ?? task.message);
        return {
          status: "failed",
          receipt: { id },
          failure: {
            code: error?.code ?? "VIDEO_SERVICE_FAILED",
            message: `Video service task ${id} failed${error === undefined ? "" : `: ${error.message}`}`,
          },
        };
      }
      if (!["succeeded", "success", "completed"].includes(status)) {
        throw new Error(`Video service returned unknown task state ${status}`);
      }
      const videoUrl = text(object(task.content, "task content").video_url, "generated video URL");
      address(videoUrl);
      return { status: "ready", handle: { id, videoUrl }, receipt: { id } };
    },
    async collect(context) {
      const handle = object(context.handle, "task handle");
      const id = text(handle.id, "task id");
      const videoUrl = address(text(handle.videoUrl, "generated video URL"));
      await context.reportProgress?.({ phase: "Receiving generated Seedance video" });
      const response = await fetcher(videoUrl, {
        signal: AbortSignal.timeout(600_000),
      });
      if (!response.ok) throw new Error(`Video service result download for task ${id} returned HTTP ${response.status}`);
      const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim();
      if (!mediaType?.startsWith("video/")) throw new Error("Video service returned a non-video result");
      const artifact = await context.resources.put(new Uint8Array(await response.arrayBuffer()), mediaType);
      return {
        status: "completed",
        receipt: { id },
        result: {
          value: {
            kind: "inline",
            value: canonicalize(sealGeneratedVideoSet({ videos: [artifact] })),
          },
        },
      };
    },
  };

  return defineEndpoint({
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    credentialInputs: { apiKey: { label: "Vectrust Seedance API key" } },
    defaultConcurrency: options.concurrency ?? 1,
    actionLimits: { submit: { concurrency: 1 }, poll: { concurrency: 4 }, collect: { concurrency: 2 } },
    pricing: { kind: "page", url: base },
    capabilities: [{ capability, returns: generationTypes.videoSet, lifecycle: "asynchronous", supports: serviceSupport, endpoint }],
  });
}

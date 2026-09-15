import { canonicalize, defineEndpointPackage, wakeAfter } from "@hypit/hypit/endpoint-kit";
import type { AsyncEndpoint, BlobRef, CredentialRef, EndpointRequest, ResourceStore } from "@hypit/hypit/endpoint-kit";
import { generationTypes, sealGeneratedVideoSet } from "@hypit/hypit/generation";
import type { GenerationPortValue } from "@hypit/hypit/generation";

/**
 * Capability implemented by this Provider.
 *
 * Matches the video Model declared by the user's fork branch `feature/alibaba-video`
 * (package `@hypit/alibaba-video`, model / capability `alibaba-qwen-vvg`).
 * That branch ships the Model + SVML surfaces (`<alibaba:TextVideo>`); this Provider
 * is the missing Endpoint that actually calls DashScope. No name guessing needed.
 */
export const CAPABILITY_NAME = "alibaba-qwen-vvg";
export const capability = {
  module: { name: "@hypit/alibaba-video", version: "1" },
  name: CAPABILITY_NAME,
} as const;

export const providerModule = { name: "@example/provider-wanx", version: "1" } as const;

// 阿里云控制台里唯一可用的 video 模型（用户实测），t2v / i2v 暂统一用同一个。
const DEFAULT_MODEL_T2V = "wan3.0-video";
const DEFAULT_MODEL_I2V = "wan3.0-video";
const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com";

/** A request's ports arrive as a plain map of port name -> values. */
type PortMap = Record<string, readonly GenerationPortValue[]>;

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Expected nonempty text");
  return value;
}
function firstText(ports: PortMap, name: string): string | undefined {
  const v = ports[name]?.[0];
  return typeof v === "string" ? v : undefined;
}
function firstNumber(ports: PortMap, name: string): number | undefined {
  const v = ports[name]?.[0];
  return typeof v === "number" ? v : undefined;
}
/** A media port value carries `{ role, artifact: BlobRef, fields? }`. */
function isMediaValue(v: unknown): v is { role: string; artifact: BlobRef } {
  return (
    typeof v === "object" && v !== null &&
    "artifact" in v! && (v as any).artifact?.kind === "blob" &&
    typeof (v as any).artifact.resource === "string"
  );
}
/** Resolve the optional `referenceImage` port into a base64 data URI. */
async function resolveReferenceImage(ports: PortMap, resources: ResourceStore): Promise<string | undefined> {
  const v = ports["referenceImage"]?.[0];
  if (isMediaValue(v) && (v.role === "image" || v.role === "video")) {
    const bytes = await resources.get(v.artifact.resource);
    if (bytes === undefined) throw new Error("Reference image is unavailable in the resource store");
    let bin = "";
    const chunk = 0x8000;
    const u = new Uint8Array(bytes);
    for (let i = 0; i < u.length; i += chunk) bin += String.fromCharCode(...u.subarray(i, i + chunk));
    return `data:${v.artifact.mediaType || "image/png"};base64,${btoa(bin)}`;
  }
  return undefined;
}

/** Wanx only accepts a few sizes; pick the supported one for the requested aspect ratio. */
function wanxSize(aspectRatio?: string): string {
  switch (aspectRatio) {
    case "9:16": return "720*1280";
    case "1:1": return "1024*1024";
    case "4:3": return "1280*720";
    case "3:4": return "720*1280";
    case "16:9":
    default: return "1280*720";
  }
}
/** Wanx durations are 5 or 10 (integers); clamp the branch's 5–10 range. */
function wanxDuration(raw?: number): number {
  const n = Math.round(raw ?? 5);
  return n >= 8 ? 10 : 5;
}

function support(request: EndpointRequest) {
  const ports = (request.constraints as unknown as { ports?: PortMap }).ports ?? {};
  if (!firstText(ports, "prompt")) {
    return { status: "unsupported" as const, reason: "This Provider requires a `prompt` text port" };
  }
  return { status: "supported" as const };
}

export function createWanxProvider(options: {
  instance: string; pool: string; baseUrl?: string; apiKey: CredentialRef;
  model?: string; modelI2V?: string; concurrency?: number; pollIntervalMs?: number; fetch?: typeof globalThis.fetch;
}) {
  const base = (options.baseUrl ?? DASHSCOPE_BASE).replace(/\/$/u, "");
  const fetcher = options.fetch ?? globalThis.fetch;
  const modelT2V = options.model ?? DEFAULT_MODEL_T2V;
  const modelI2V = options.modelI2V ?? DEFAULT_MODEL_I2V;
  const interval = options.pollIntervalMs ?? 5_000;
  const key = (credentials: Readonly<Record<string, { secret: string }>>) => text(credentials.apiKey?.secret);

  async function wanxJson(path: string, secret: string, init: RequestInit = {}) {
    const response = await fetcher(`${base}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Wanx ${init.method ?? "GET"} ${path} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
    }
    try { return JSON.parse(body); } catch { return {}; }
  }

  const endpoint: AsyncEndpoint = {
    async start(context) {
      const supported = support(context.need);
      if (supported.status === "unsupported") throw new Error(supported.reason);
      const secret = key(context.credentials);
      const ports = (context.need.constraints as unknown as { ports: PortMap }).ports;

      const prompt = firstText(ports, "prompt");
      if (!prompt) throw new Error("Missing prompt");
      const imageUri = await resolveReferenceImage(ports, context.resources);
      const model = imageUri ? modelI2V : modelT2V;

      const size = wanxSize(firstText(ports, "aspectRatio"));
      const duration = wanxDuration(firstNumber(ports, "duration"));

      const input: Record<string, unknown> = { prompt };
      if (imageUri) input.image_url = imageUri; // image-to-video when a reference is supplied

      await context.reportProgress?.({ phase: `Submitting Wanx ${model} request` });
      const task = await wanxJson("/api/v1/services/aigc/video-generation/video-synthesis", secret, {
        method: "POST",
        headers: { "X-DashScope-Async": "enable" },
        body: JSON.stringify({ model, input, parameters: { size, duration } }),
      });
      const taskId = text(task?.output?.task_id ?? task?.task_id);
      const handle = { taskId };
      await context.checkpoint?.({ handle, receipt: { id: taskId } });
      return { ...wakeAfter(handle, interval), receipt: { id: taskId } };
    },

    async poll(context) {
      const taskId = text((context.handle as { taskId?: string }).taskId);
      const secret = key(context.credentials);
      const task = await wanxJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, secret);
      const status: string = task?.output?.task_status ?? task?.task_status ?? "PENDING";
      if (status === "PENDING" || status === "RUNNING") {
        return wakeAfter({ taskId }, interval, Date.now(), { phase: status });
      }
      if (status === "FAILED") {
        const msg = String(task?.output?.message ?? task?.message ?? "Wanx task failed");
        return { status: "failed" as const, receipt: { id: taskId }, failure: { code: "WANX_FAILED", message: `Wanx task ${taskId} failed: ${msg}` } };
      }
      if (status !== "SUCCEEDED") throw new Error(`Wanx returned unknown task status: ${status}`);
      const videoUrl: string | undefined =
        task?.output?.video_url ?? task?.output?.results?.[0]?.url ?? task?.output?.url;
      if (!videoUrl) throw new Error(`Wanx task ${taskId} succeeded but returned no video URL`);
      return { status: "ready" as const, handle: { taskId, url: videoUrl } };
    },

    async collect(context) {
      const url = text((context.handle as { url?: string }).url);
      await context.reportProgress?.({ phase: "Receiving generated video" });
      const response = await fetcher(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Video download returned HTTP ${response.status}`);
      const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "video/mp4";
      if (!mediaType.startsWith("video/")) throw new Error(`Wanx returned a non-video result: ${mediaType}`);
      const artifact = await context.resources.put(new Uint8Array(await response.arrayBuffer()), mediaType);
      return { status: "completed" as const, result: { value: {
        kind: "inline", value: canonicalize(sealGeneratedVideoSet({ videos: [artifact] })),
      } } };
    },
  };

  return defineEndpointPackage({
    module: providerModule,
    facet: "videos",
    instance: options.instance,
    pool: options.pool,
    credentials: { apiKey: options.apiKey },
    credentialInputs: { apiKey: { label: "DashScope / Alibaba API key (DASHSCOPE_API_KEY)" } },
    defaultConcurrency: options.concurrency ?? 1,
    actionLimits: { submit: { concurrency: 1 }, poll: { concurrency: 4 }, collect: { concurrency: 1 } },
    pricing: { kind: "page", url: "https://help.aliyun.com/zh/model-studio/wanx-video/" },
    capabilities: [{ capability, returns: generationTypes.videoSet, lifecycle: "asynchronous", supports: support, endpoint }],
  });
}

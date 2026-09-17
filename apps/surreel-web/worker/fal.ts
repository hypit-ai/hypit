import { clipSeconds } from "../src/timing.ts";

export const IMAGE_MODEL = "openai/gpt-image-2.5/flare/text-to-image";
export const VIDEO_MODEL = "bytedance/seedance-2.0/fast/image-to-video";
export const VIDEO_TEXT_MODEL = "bytedance/seedance-2.0/fast/text-to-video";
export const CAPTION_EDIT_MODEL = "fal-ai/workflow-utilities/add-subtitles-to-video";
export const MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";

export function mergeInput(videoUrls: string[]): Record<string, unknown> {
  return { video_urls: videoUrls };
}

export function captionEditInput(videoUrl: string, cues: Array<{ start: number; end: number; text: string }>): Record<string, unknown> {
  return {
    video_url: videoUrl,
    subtitles: cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text })),
    font_name: "Montserrat",
    font_size: 64,
    font_weight: "bold",
    font_color: "white",
    stroke_width: 3,
    stroke_color: "black",
    background_color: "none",
    position: "bottom",
  };
}

export function videoModelId(_videoSkill: string | undefined, hasImage: boolean): string {
  return hasImage ? VIDEO_MODEL : VIDEO_TEXT_MODEL;
}

export function videoInput(_model: string, input: { prompt: string; imageUrl?: string; aspectRatio: string; duration: number }): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    duration: String(clipSeconds(input.duration)),
    resolution: "720p",
    aspect_ratio: input.aspectRatio,
    generate_audio: true,
  };
  if (input.imageUrl) payload.image_url = input.imageUrl;
  return payload;
}

const QUEUE = "https://queue.fal.run";

export type QueueStatus = {
  status: string;
  request_id: string;
  response_url?: string;
  status_url?: string;
};

export class FalError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "FalError";
  }
}

function appId(model: string): string {
  if (model.includes("h3-max") || model.includes("seedance-2.0")) return model;
  return model.split("/").slice(0, 2).join("/");
}

function detailOf(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 400);
  if (body === null || typeof body !== "object") return "unknown error";
  const record = body as Record<string, unknown>;
  const detail = record.detail ?? record.message ?? record.error;
  if (typeof detail === "string") return detail;
  return JSON.stringify(body).slice(0, 400);
}

export async function falFetch<T>(key: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not json
  }
  if (!response.ok) throw new FalError(`fal ${response.status}: ${detailOf(body)}`, response.status);
  return body as T;
}

export function submit(key: string, model: string, input: unknown): Promise<QueueStatus> {
  return falFetch<QueueStatus>(key, `${QUEUE}/${model}`, { method: "POST", body: JSON.stringify(input ?? {}) });
}

export function status(key: string, model: string, requestId: string): Promise<QueueStatus> {
  return falFetch<QueueStatus>(key, `${QUEUE}/${appId(model)}/requests/${encodeURIComponent(requestId)}/status`);
}

export function result(key: string, model: string, requestId: string): Promise<unknown> {
  return falFetch<unknown>(key, `${QUEUE}/${appId(model)}/requests/${encodeURIComponent(requestId)}`);
}

export function isTerminal(phase: unknown): boolean {
  return ["COMPLETED", "FAILED", "CANCELLED", "ERROR"].includes(String(phase ?? ""));
}

export function mediaUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.url === "string") return record.url;
  const video = record.video;
  if (video && typeof video === "object" && typeof (video as { url?: unknown }).url === "string") {
    return (video as { url: string }).url;
  }
  const images = record.images;
  if (Array.isArray(images) && images[0] && typeof images[0] === "object" && typeof (images[0] as { url?: unknown }).url === "string") {
    return (images[0] as { url: string }).url;
  }
  const image = record.image;
  if (image && typeof image === "object" && typeof (image as { url?: unknown }).url === "string") {
    return (image as { url: string }).url;
  }
  return undefined;
}

export function refusal(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const detail = (value as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.length > 0) return detail;
  if (!Array.isArray(detail)) return undefined;
  const said = detail
    .map((item) => (item && typeof item === "object" ? (item as { msg?: unknown }).msg : undefined))
    .filter((msg): msg is string => typeof msg === "string" && msg.length > 0);
  return said.length === 0 ? undefined : said.join("; ");
}

export { clipSeconds as videoSeconds } from "../src/timing.ts";

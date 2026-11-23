import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import type { ProjectMediaAssetEdit, ProjectMediaLibraryEdit } from "@hypit/media-asset/service";
import type {
  NleStudioActionObservation,
  NleStudioActionRequest,
  NleStudioErrorResponse,
  NleStudioEvent,
  NleStudioObservation,
  NleStudioObservationRequest,
  NleStudioOpenProjection,
  NleStudioOperation,
  NleStudioOperationReceipt,
} from "../protocol.js";

export function connectStudioEvents(input: {
  readonly ready: () => void;
  readonly change: (event: NleStudioEvent) => void;
  readonly invalid: (error: Error) => void;
}): () => void {
  const source = new EventSource("api/events");
  source.addEventListener("ready", input.ready);
  source.addEventListener("error", () => input.invalid(new Error("Studio 事件连接暂时中断，正在重连。")));
  source.addEventListener("change", (message) => {
    try {
      input.change(JSON.parse(message.data) as NleStudioEvent);
    } catch (error) {
      input.invalid(error instanceof Error ? error : new Error(String(error)));
    }
  });
  return () => source.close();
}

export class NleStudioSaveConflict extends Error {}

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json() as T & Partial<NleStudioErrorResponse>;
  if (!response.ok) {
    const message = value.error ?? `NLE Studio request failed with ${response.status}.`;
    if (path === "api/save" && value.code === "document-conflict") throw new NleStudioSaveConflict(message);
    throw new Error(message);
  }
  return value;
}

export async function readDropDestination(drop: import("../protocol.js").NleStudioTimelineDrop) {
  const result = await observe({ kind: "timeline-drop", drop });
  if (result.kind !== "timeline-drop") throw new Error("NLE Studio returned an invalid drop observation.");
  return result.value;
}

async function observe(value: NleStudioObservationRequest): Promise<NleStudioObservation> {
  return await request("api/observe", value);
}

export async function readOpen(): Promise<NleStudioOpenProjection> {
  const result = await observe({ kind: "open" });
  if (result.kind !== "open") throw new Error("NLE Studio returned another observation kind for open.");
  const library = result.value.mediaLibrary;
  if (library?.state !== "available" && library?.state !== "invalid") {
    throw new Error("当前 Studio 页面和 Host 的会话数据不一致。请用当前构建重新启动 Host，再打开 Studio。");
  }
  return result.value;
}

export async function readInspector(item: string) {
  const [scene, component] = await Promise.all([
    observe({ kind: "inspector", item }),
    observe({ kind: "component-inputs", item }),
  ]);
  if (scene.kind !== "inspector" || component.kind !== "component-inputs") {
    throw new Error("NLE Studio returned an unexpected Inspector observation.");
  }
  return { scene: scene.value, component: component.value };
}

export async function readTransitionInspector(transition: string) {
  const result = await observe({ kind: "transition-inspector", transition });
  if (result.kind !== "transition-inspector") throw new Error("NLE Studio returned another observation kind for Transition Inspector.");
  return result.value;
}

export async function refreshOpen(
  current: NleStudioOpenProjection,
  change: Pick<NleStudioOperationReceipt, "invalidated"> & Partial<Pick<NleStudioOperationReceipt, "status">>,
): Promise<NleStudioOpenProjection> {
  const requested = new Set(change.invalidated);
  const observations = await Promise.all([
    ...(requested.has("project") ? [observe({ kind: "project" })] : []),
    ...(requested.has("timeline") ? [observe({ kind: "timeline" })] : []),
    ...(requested.has("canvas") ? [observe({ kind: "canvas" })] : []),
    ...(requested.has("media") ? [observe({ kind: "media" })] : []),
    ...(requested.has("media-library") ? [observe({ kind: "media-library" })] : []),
    ...(requested.has("catalog") ? [observe({ kind: "catalog" })] : []),
    ...(requested.has("preview") ? [observe({ kind: "preview" })] : []),
    ...(requested.has("delivery") ? [observe({ kind: "delivery" })] : []),
    ...(requested.has("clipboard") ? [observe({ kind: "clipboard" })] : []),
    ...(change.status === undefined ? [observe({ kind: "status" })] : []),
  ]);
  let next: NleStudioOpenProjection = { ...current, status: change.status ?? current.status };
  for (const observation of observations) {
    switch (observation.kind) {
      case "project": next = { ...next, project: observation.value }; break;
      case "timeline": next = { ...next, timeline: observation.value }; break;
      case "canvas": next = { ...next, canvas: observation.value }; break;
      case "media": next = { ...next, media: observation.value }; break;
      case "media-library": next = { ...next, mediaLibrary: observation.value }; break;
      case "catalog": next = { ...next, catalog: observation.value }; break;
      case "preview": next = { ...next, preview: observation.value }; break;
      case "delivery": next = { ...next, delivery: observation.value }; break;
      case "clipboard": next = { ...next, clipboard: observation.value }; break;
      case "status": next = { ...next, status: observation.value }; break;
      case "open":
      case "component-inputs":
      case "timeline-drop":
      case "transition-inspector":
      case "action":
      case "inspector": throw new Error(`NLE Studio returned unexpected ${observation.kind} observation.`);
    }
  }
  const previousRate = current.timeline.scene.editRate;
  const nextRate = next.timeline.scene.editRate;
  if (!requested.has("media") && (previousRate.numerator !== nextRate.numerator || previousRate.denominator !== nextRate.denominator)) {
    const media = await observe({ kind: "media" });
    if (media.kind === "media") next = { ...next, media: media.value };
  }
  return next;
}

export function sendCommand(command: NleEditingSurfaceCommand): Promise<NleStudioOperationReceipt> {
  return request("api/command", { command });
}

export function operate(value: NleStudioOperation): Promise<NleStudioOperationReceipt> {
  return request("api/operate", value);
}

export function editMediaLibrary(value: ProjectMediaLibraryEdit): Promise<NleStudioOperationReceipt> {
  return request("api/media/library", value);
}

export function editMediaAsset(value: ProjectMediaAssetEdit): Promise<NleStudioOperationReceipt> {
  return request("api/media/asset", value);
}

export async function importMedia(file: File, folder: string | null): Promise<NleStudioOperationReceipt> {
  const query = new URLSearchParams({ name: file.name });
  if (folder !== null) query.set("folder", folder);
  const response = await fetch(`api/media/import?${query}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  const value = await response.json() as NleStudioOperationReceipt & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `NLE Studio Media import failed with ${response.status}.`);
  return value;
}

export function startAction(value: NleStudioActionRequest): Promise<NleStudioActionObservation> {
  return request("api/actions", value);
}

export async function readAction(handle: string): Promise<NleStudioActionObservation> {
  return request(`api/actions/${encodeURIComponent(handle)}`);
}

export async function cancelAction(handle: string): Promise<NleStudioActionObservation> {
  const response = await fetch(`api/actions/${encodeURIComponent(handle)}`, { method: "DELETE" });
  const value = await response.json() as NleStudioActionObservation & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `NLE Studio Action cancellation failed with ${response.status}.`);
  return value;
}

export function saveSession(): Promise<NleStudioOperationReceipt> {
  return request("api/save", {});
}

export function reloadSession(): Promise<NleStudioOperationReceipt> {
  return request("api/reload", {});
}

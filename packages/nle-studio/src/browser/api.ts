import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import type {
  NleStudioAdjustMaterializeRequest,
  NleStudioComponentMaterializeRequest,
  NleStudioDeliveryObservation,
  NleStudioDeliveryStartRequest,
  NleStudioEvent,
  NleStudioMediaPlaceRequest,
  NleStudioObservation,
  NleStudioObservationRequest,
  NleStudioOpenProjection,
  NleStudioOperationReceipt,
  NleStudioTransitionMaterializeRequest,
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

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `NLE Studio request failed with ${response.status}.`);
  return value;
}

async function observe(value: NleStudioObservationRequest): Promise<NleStudioObservation> {
  return await request("api/observe", value);
}

export async function readOpen(): Promise<NleStudioOpenProjection> {
  const result = await observe({ kind: "open" });
  if (result.kind !== "open") throw new Error("NLE Studio returned another observation kind for open.");
  return result.value;
}

export async function readInspector(item: string) {
  const result = await observe({ kind: "inspector", item });
  if (result.kind !== "inspector") throw new Error("NLE Studio returned another observation kind for Inspector.");
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
    ...(requested.has("catalog") ? [observe({ kind: "catalog" })] : []),
    ...(requested.has("preview") ? [observe({ kind: "preview" })] : []),
    ...(requested.has("delivery") ? [observe({ kind: "delivery" })] : []),
    ...(change.status === undefined ? [observe({ kind: "status" })] : []),
  ]);
  let next: NleStudioOpenProjection = { ...current, status: change.status ?? current.status };
  for (const observation of observations) {
    switch (observation.kind) {
      case "project": next = { ...next, project: observation.value }; break;
      case "timeline": next = { ...next, timeline: observation.value }; break;
      case "canvas": next = { ...next, canvas: observation.value }; break;
      case "media": next = { ...next, media: observation.value }; break;
      case "catalog": next = { ...next, catalog: observation.value }; break;
      case "preview": next = { ...next, preview: observation.value }; break;
      case "delivery": next = { ...next, delivery: observation.value }; break;
      case "status": next = { ...next, status: observation.value }; break;
      case "open":
      case "inspector": throw new Error(`NLE Studio returned unexpected ${observation.kind} observation.`);
    }
  }
  return next;
}

export function sendCommand(command: NleEditingSurfaceCommand): Promise<NleStudioOperationReceipt> {
  return request("api/command", { command });
}

export function placeMedia(value: NleStudioMediaPlaceRequest): Promise<NleStudioOperationReceipt> {
  return request("api/media/place", value);
}

export async function importMedia(file: File): Promise<NleStudioOperationReceipt> {
  const response = await fetch(`api/media/import?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  const value = await response.json() as NleStudioOperationReceipt & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `NLE Studio Media import failed with ${response.status}.`);
  return value;
}

export function materializeComponent(value: NleStudioComponentMaterializeRequest): Promise<NleStudioOperationReceipt> {
  return request("api/catalog/components/materialize", value);
}

export function materializeAdjust(value: NleStudioAdjustMaterializeRequest): Promise<NleStudioOperationReceipt> {
  return request("api/catalog/adjusts/materialize", value);
}

export function materializeTransition(value: NleStudioTransitionMaterializeRequest): Promise<NleStudioOperationReceipt> {
  return request("api/catalog/transitions/materialize", value);
}

export function startDelivery(value: NleStudioDeliveryStartRequest): Promise<NleStudioDeliveryObservation> {
  return request("api/deliveries", value);
}

export async function readDelivery(handle: string): Promise<NleStudioDeliveryObservation> {
  const response = await fetch(`api/deliveries/${encodeURIComponent(handle)}`);
  const value = await response.json() as NleStudioDeliveryObservation & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `NLE Studio Delivery read failed with ${response.status}.`);
  return value;
}

export async function cancelDelivery(handle: string): Promise<NleStudioDeliveryObservation> {
  const response = await fetch(`api/deliveries/${encodeURIComponent(handle)}`, { method: "DELETE" });
  const value = await response.json() as NleStudioDeliveryObservation & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `NLE Studio Delivery cancellation failed with ${response.status}.`);
  return value;
}

export function saveSession(): Promise<NleStudioOperationReceipt> {
  return request("api/save", {});
}

export function reloadSession(): Promise<NleStudioOperationReceipt> {
  return request("api/reload", {});
}

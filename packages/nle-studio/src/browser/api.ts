import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import type { NleStudioInspectorResponse, NleStudioSession } from "../protocol.js";

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

export function readSession(): Promise<NleStudioSession> {
  return request("/api/session");
}

export function sendCommand(command: NleEditingSurfaceCommand): Promise<NleStudioSession> {
  return request("/api/command", { command });
}

export function readInspector(item: string): Promise<NleStudioInspectorResponse> {
  return request("/api/inspector", { item });
}

export function saveSession(): Promise<NleStudioSession> {
  return request("/api/save", {});
}

export function reloadSession(): Promise<NleStudioSession> {
  return request("/api/reload", {});
}

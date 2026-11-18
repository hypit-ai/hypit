import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import type {
  NleStudioAdjustMaterializeRequest,
  NleStudioComponentMaterializeRequest,
  NleStudioConflict,
  NleStudioInspectorResponse,
  NleStudioMediaPlaceRequest,
  NleStudioSession,
  NleStudioTransitionMaterializeRequest,
} from "../protocol.js";

export class StudioConflictError extends Error {
  constructor(readonly conflict: NleStudioConflict, message: string) {
    super(message);
    this.name = "StudioConflictError";
  }
}

async function studioResponse<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: string; conflict?: NleStudioConflict };
  if (!response.ok) {
    const message = value.error ?? `NLE Studio request failed with ${response.status}.`;
    if (response.status === 409 && value.conflict) throw new StudioConflictError(value.conflict, message);
    throw new Error(message);
  }
  return value;
}

export async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return studioResponse<T>(response);
}

export function readSession(): Promise<NleStudioSession> {
  return request("api/session");
}

export async function sendCommand(command: NleEditingSurfaceCommand, currentViewRevision?: number): Promise<NleStudioSession> {
  try {
    return await request("api/command", { command });
  } catch (error) {
    const projectMutation = command.kind === "project.transact" || command.kind === "project.undo" || command.kind === "project.redo";
    const staleView = error instanceof Error && /^NLE View (?:Group .+ references missing Item |Composition .+ references missing Track |references missing Composition |active Composition .+ does not exist)/u.test(error.message);
    const viewRevision = "expectedViewRevision" in command ? command.expectedViewRevision : currentViewRevision;
    if (!projectMutation || !staleView || viewRevision === undefined) throw error;
    // A Project edit can be accepted before the product's subsequent View projection fails.
    // Reconcile that exact resulting revision without resubmitting the Project mutation.
    try {
      return await request("api/command", { command: {
        kind: "view.reconcile",
        expectedProjectRevision: command.expectedProjectRevision + 1,
        expectedViewRevision: viewRevision,
      } });
    } catch {
      throw error;
    }
  }
}

export function placeMedia(value: NleStudioMediaPlaceRequest): Promise<NleStudioSession> {
  return request("api/media/place", value);
}

export async function importMedia(file: File): Promise<NleStudioSession> {
  const response = await fetch(`api/media/import?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  return studioResponse<NleStudioSession>(response);
}

export function materializeComponent(value: NleStudioComponentMaterializeRequest): Promise<NleStudioSession> {
  return request("api/catalog/components/materialize", value);
}

export function materializeAdjust(value: NleStudioAdjustMaterializeRequest): Promise<NleStudioSession> {
  return request("api/catalog/adjusts/materialize", value);
}

export function materializeTransition(value: NleStudioTransitionMaterializeRequest): Promise<NleStudioSession> {
  return request("api/catalog/transitions/materialize", value);
}

export function readInspector(item: string): Promise<NleStudioInspectorResponse> {
  return request("api/inspector", { item });
}

export function saveSession(): Promise<NleStudioSession> {
  return request("api/save", {});
}

export async function checkSessionDocuments(): Promise<void> {
  await request("api/documents/check", {});
}

export function reloadSession(): Promise<NleStudioSession> {
  return request("api/reload", {});
}

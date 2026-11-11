import { parseSceneProject, serializeSceneProject } from "./project.js";
import { assertSceneEditSession, createSceneEditSession } from "./session.js";
import type { SceneEditSession } from "./session.js";

export type SceneProjectSaveTicket = {
  readonly session: symbol;
  readonly position: number;
  readonly revision: number;
  readonly text: string;
};

export class SceneSaveTicketMismatch extends Error {
  constructor() {
    super("Scene save ticket belongs to another open edit session.");
    this.name = "SceneSaveTicketMismatch";
  }
}

function containsPosition(session: SceneEditSession, position: number): boolean {
  return position === 0 || session.history.some((entry) => entry.afterPosition === position);
}

export function assertSceneProjectSaveTicket(value: SceneProjectSaveTicket): void {
  if (typeof value.session !== "symbol") throw new Error("Scene save-ticket session is invalid.");
  if (!Number.isSafeInteger(value.position) || value.position < 0) throw new Error("Scene save-ticket position is invalid.");
  const project = parseSceneProject(value.text);
  if (project.revision !== value.revision) throw new Error("Scene save-ticket revision does not match its Project text.");
}

export function openSceneProjectText(text: string): SceneEditSession {
  return createSceneEditSession(parseSceneProject(text));
}

export function prepareSceneProjectSave(session: SceneEditSession): SceneProjectSaveTicket {
  assertSceneEditSession(session);
  return Object.freeze({
    session: session.session,
    position: session.position,
    revision: session.current.revision,
    text: serializeSceneProject(session.current),
  });
}

export function completeSceneProjectSave(
  session: SceneEditSession,
  ticket: SceneProjectSaveTicket,
): SceneEditSession {
  assertSceneEditSession(session);
  assertSceneProjectSaveTicket(ticket);
  if (ticket.session !== session.session) throw new SceneSaveTicketMismatch();
  return {
    ...session,
    savepoint: containsPosition(session, ticket.position) ? ticket.position : undefined,
  };
}

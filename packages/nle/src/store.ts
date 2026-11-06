import { parseNleProject, serializeNleProject } from "./project.js";
import {
  assertNleEditSession,
  createNleEditSession,
} from "./session.js";
import type {
  NleEditSession,
  NleHistoryEntry,
} from "./session.js";

/** One exact Project snapshot prepared for an asynchronous Host write. */
export type NleProjectSaveTicket = {
  /** In-memory lineage; tickets cannot be completed against another open document. */
  readonly session: symbol;
  readonly position: number;
  readonly revision: number;
  readonly text: string;
};

export class NleSaveTicketMismatch extends Error {
  constructor() {
    super("NLE save ticket belongs to another edit session.");
    this.name = "NleSaveTicketMismatch";
  }
}

function containsPosition(history: readonly NleHistoryEntry[], position: number): boolean {
  return position === 0 || history.some((entry) => entry.afterPosition === position);
}

export function assertNleProjectSaveTicket(ticket: NleProjectSaveTicket): void {
  if (typeof ticket.session !== "symbol") throw new Error("NLE save-ticket session is invalid.");
  if (!Number.isSafeInteger(ticket.position) || ticket.position < 0) {
    throw new Error("NLE save-ticket position is invalid.");
  }
  if (!Number.isSafeInteger(ticket.revision) || ticket.revision < 0) {
    throw new Error("NLE save-ticket revision is invalid.");
  }
  const project = parseNleProject(ticket.text);
  if (project.revision !== ticket.revision) {
    throw new Error("NLE save-ticket revision does not match its Project text.");
  }
}

/** Opens a serialized `hypit.nle@1` JSON Project as a clean edit session. */
export function openNleProjectText(text: string): NleEditSession {
  return createNleEditSession(parseNleProject(text));
}

/**
 * Freezes the exact bytes and logical history position to be written.
 * The caller may continue editing while a Host writes `text`.
 */
export function prepareNleProjectSave(session: NleEditSession): NleProjectSaveTicket {
  assertNleEditSession(session);
  return Object.freeze({
    session: session.session,
    position: session.position,
    revision: session.current.revision,
    text: serializeNleProject(session.current),
  });
}

/**
 * Confirms a successful Host write without treating later edits as saved.
 * A ticket whose branch was discarded leaves the current Session dirty.
 */
export function completeNleProjectSave(
  session: NleEditSession,
  ticket: NleProjectSaveTicket,
): NleEditSession {
  assertNleEditSession(session);
  assertNleProjectSaveTicket(ticket);
  if (ticket.session !== session.session) throw new NleSaveTicketMismatch();
  return {
    ...session,
    savepoint: containsPosition(session.history, ticket.position) ? ticket.position : undefined,
  };
}

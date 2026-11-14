import { assertNleProject, sealNleProject } from "./project.js";
import { applyNleTransaction } from "./transaction.js";
import type { NleTransaction } from "./transaction.js";
import type { NleProject } from "./types.js";

export type NleEdit = {
  /** One user-facing intention, such as "Move title" or "Import captions". */
  readonly label: string;
  readonly transaction: NleTransaction;
};

export type NleHistoryEntry = {
  readonly label: string;
  /** The originally accepted edit. Redo replays it against the exact restored logical position. */
  readonly transaction: NleTransaction;
  readonly beforePosition: number;
  readonly afterPosition: number;
  readonly before: NleProject;
};

/**
 * Host-session state around one persistent NLE Project.
 *
 * History and the savepoint are deliberately absent from NleProject serialization.
 */
export type NleEditSession = {
  /** In-memory identity used to reject save tickets from another open document session. */
  readonly session: symbol;
  readonly current: NleProject;
  readonly history: readonly NleHistoryEntry[];
  /** Number of history entries currently applied. */
  readonly cursor: number;
  /** Stable identity of the current logical history position. */
  readonly position: number;
  /** Next unused logical position; unlike Project revision, undo does not advance it. */
  readonly nextPosition: number;
  /** A logical position whose Project content was last saved, or absent after its branch was discarded. */
  readonly savepoint: number | undefined;
};

export class NleHistoryBoundary extends Error {
  constructor(readonly direction: "undo" | "redo") {
    super(`NLE history cannot ${direction} from its current position.`);
    this.name = "NleHistoryBoundary";
  }
}

function assertLabel(value: string): void {
  if (value.trim().length === 0) throw new Error("NLE edit label is empty.");
}

export function assertNleEditSession(session: NleEditSession): void {
  assertNleProject(session.current);
  if (typeof session.session !== "symbol") throw new Error("NLE edit-session identity is invalid.");
  if (!Number.isSafeInteger(session.cursor)
    || session.cursor < 0
    || session.cursor > session.history.length) {
    throw new Error("NLE edit-session cursor is invalid.");
  }
  let previous = 0;
  let maximumPosition = 0;
  const positions = new Set<number>([0]);
  for (const entry of session.history) {
    if (entry.beforePosition !== previous
      || !Number.isSafeInteger(entry.afterPosition)
      || entry.afterPosition <= 0
      || positions.has(entry.afterPosition)) {
      throw new Error("NLE edit-session history positions are invalid.");
    }
    positions.add(entry.afterPosition);
    previous = entry.afterPosition;
    maximumPosition = Math.max(maximumPosition, entry.afterPosition);
  }
  const expectedPosition = session.cursor === 0
    ? 0
    : session.history[session.cursor - 1]?.afterPosition;
  if (session.position !== expectedPosition) throw new Error("NLE edit-session position is invalid.");
  if (!Number.isSafeInteger(session.nextPosition)
    || session.nextPosition <= maximumPosition) {
    throw new Error("NLE edit-session next position is invalid.");
  }
  if (session.savepoint !== undefined && !positions.has(session.savepoint)) {
    throw new Error("NLE edit-session savepoint is invalid.");
  }
}

function containsPosition(history: readonly NleHistoryEntry[], position: number): boolean {
  return position === 0 || history.some((entry) => entry.afterPosition === position);
}

function incrementRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error("NLE Project revision cannot advance safely.");
  }
  return revision + 1;
}

function incrementPosition(position: number): number {
  if (!Number.isSafeInteger(position) || position < 0 || position >= Number.MAX_SAFE_INTEGER) {
    throw new Error("NLE edit-session position cannot advance safely.");
  }
  return position + 1;
}

function restoreAtRevision(snapshot: NleProject, revision: number): NleProject {
  const restored = structuredClone(snapshot) as { revision: number } & NleProject;
  restored.revision = revision;
  return sealNleProject(restored);
}

export function createNleEditSession(
  project: NleProject,
  options: { readonly saved?: boolean } = {},
): NleEditSession {
  return {
    session: Symbol("NLE edit session"),
    current: sealNleProject(project),
    history: [],
    cursor: 0,
    position: 0,
    nextPosition: 1,
    savepoint: options.saved === false ? undefined : 0,
  };
}

/** Commits one complete user intention and discards any redo branch after the cursor. */
export function commitNleEdit(session: NleEditSession, edit: NleEdit): NleEditSession {
  assertNleEditSession(session);
  assertLabel(edit.label);
  const before = sealNleProject(session.current);
  const after = applyNleTransaction(before, edit.transaction);
  const retainedHistory = session.history.slice(0, session.cursor);
  const savepoint = session.savepoint !== undefined && containsPosition(retainedHistory, session.savepoint)
    ? session.savepoint
    : undefined;
  const afterPosition = session.nextPosition;
  const entry: NleHistoryEntry = {
    label: edit.label,
    transaction: structuredClone(edit.transaction),
    beforePosition: session.position,
    afterPosition,
    before,
  };
  return {
    session: session.session,
    current: sealNleProject(after),
    history: [...retainedHistory, entry],
    cursor: retainedHistory.length + 1,
    position: afterPosition,
    nextPosition: incrementPosition(session.nextPosition),
    savepoint,
  };
}

export function canUndoNleEdit(session: NleEditSession): boolean {
  assertNleEditSession(session);
  return session.cursor > 0;
}

export function canRedoNleEdit(session: NleEditSession): boolean {
  assertNleEditSession(session);
  return session.cursor < session.history.length;
}

export function undoNleEdit(session: NleEditSession): NleEditSession {
  assertNleEditSession(session);
  if (session.cursor === 0) throw new NleHistoryBoundary("undo");
  const entry = session.history[session.cursor - 1];
  if (entry === undefined) throw new NleHistoryBoundary("undo");
  return {
    ...session,
    current: restoreAtRevision(entry.before, incrementRevision(session.current.revision)),
    cursor: session.cursor - 1,
    position: entry.beforePosition,
  };
}

export function redoNleEdit(session: NleEditSession): NleEditSession {
  assertNleEditSession(session);
  if (session.cursor >= session.history.length) throw new NleHistoryBoundary("redo");
  const entry = session.history[session.cursor];
  if (entry === undefined) throw new NleHistoryBoundary("redo");
  const transaction = structuredClone(entry.transaction) as { revision: number } & NleTransaction;
  transaction.revision = session.current.revision;
  return {
    ...session,
    current: applyNleTransaction(session.current, transaction),
    cursor: session.cursor + 1,
    position: entry.afterPosition,
  };
}

export function markNleEditSessionSaved(session: NleEditSession): NleEditSession {
  assertNleEditSession(session);
  return { ...session, savepoint: session.position };
}

export function isNleEditSessionDirty(session: NleEditSession): boolean {
  assertNleEditSession(session);
  return session.savepoint === undefined || session.savepoint !== session.position;
}

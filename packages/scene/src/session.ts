import { assertSceneProject, sealSceneProject } from "./project.js";
import { applySceneTransaction } from "./transaction.js";
import type { SceneTransaction } from "./transaction.js";
import type { SceneProject } from "./types.js";

export type SceneEdit = {
  readonly label: string;
  readonly transaction: SceneTransaction;
};

export type SceneHistoryEntry = {
  readonly label: string;
  readonly transaction: SceneTransaction;
  readonly beforePosition: number;
  readonly afterPosition: number;
  readonly before: SceneProject;
  readonly after: SceneProject;
};

export type SceneEditSession = {
  readonly session: symbol;
  readonly current: SceneProject;
  readonly history: readonly SceneHistoryEntry[];
  readonly cursor: number;
  readonly position: number;
  readonly nextPosition: number;
  readonly savepoint: number | undefined;
};

export class SceneHistoryBoundary extends Error {
  constructor(readonly direction: "undo" | "redo") {
    super(`Scene history cannot ${direction} from its current position.`);
    this.name = "SceneHistoryBoundary";
  }
}

function containsPosition(history: readonly SceneHistoryEntry[], position: number): boolean {
  return position === 0 || history.some((entry) => entry.afterPosition === position);
}

function nextInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} cannot advance safely.`);
  }
  return value + 1;
}

function restoreAtRevision(value: SceneProject, revision: number): SceneProject {
  const restored = structuredClone(value) as { revision: number } & SceneProject;
  restored.revision = revision;
  return sealSceneProject(restored);
}

export function assertSceneEditSession(value: SceneEditSession): void {
  assertSceneProject(value.current);
  if (typeof value.session !== "symbol") throw new Error("Scene edit-session identity is invalid.");
  if (!Number.isSafeInteger(value.cursor) || value.cursor < 0 || value.cursor > value.history.length) {
    throw new Error("Scene edit-session cursor is invalid.");
  }
  const expected = value.cursor === 0 ? 0 : value.history[value.cursor - 1]?.afterPosition;
  if (value.position !== expected) throw new Error("Scene edit-session position is invalid.");
  const positions = new Set<number>([0]);
  let previous = 0;
  for (const entry of value.history) {
    if (entry.beforePosition !== previous || positions.has(entry.afterPosition)) {
      throw new Error("Scene edit-session history positions are invalid.");
    }
    positions.add(entry.afterPosition);
    previous = entry.afterPosition;
  }
  if (value.savepoint !== undefined && !positions.has(value.savepoint)) {
    throw new Error("Scene edit-session savepoint is invalid.");
  }
}

export function createSceneEditSession(
  project: SceneProject,
  options: { readonly saved?: boolean } = {},
): SceneEditSession {
  return {
    session: Symbol("Scene edit session"),
    current: sealSceneProject(project),
    history: [],
    cursor: 0,
    position: 0,
    nextPosition: 1,
    savepoint: options.saved === false ? undefined : 0,
  };
}

export function commitSceneEdit(session: SceneEditSession, edit: SceneEdit): SceneEditSession {
  assertSceneEditSession(session);
  if (edit.label.trim().length === 0) throw new Error("Scene edit label is empty.");
  const before = sealSceneProject(session.current);
  const after = applySceneTransaction(before, edit.transaction);
  const retained = session.history.slice(0, session.cursor);
  const savepoint = session.savepoint !== undefined && containsPosition(retained, session.savepoint)
    ? session.savepoint : undefined;
  const entry: SceneHistoryEntry = {
    label: edit.label,
    transaction: structuredClone(edit.transaction),
    beforePosition: session.position,
    afterPosition: session.nextPosition,
    before,
    after,
  };
  return {
    session: session.session,
    current: sealSceneProject(after),
    history: [...retained, entry],
    cursor: retained.length + 1,
    position: session.nextPosition,
    nextPosition: nextInteger(session.nextPosition, "Scene edit-session position"),
    savepoint,
  };
}

export function canUndoSceneEdit(session: SceneEditSession): boolean {
  assertSceneEditSession(session);
  return session.cursor > 0;
}

export function canRedoSceneEdit(session: SceneEditSession): boolean {
  assertSceneEditSession(session);
  return session.cursor < session.history.length;
}

export function undoSceneEdit(session: SceneEditSession): SceneEditSession {
  assertSceneEditSession(session);
  const entry = session.history[session.cursor - 1];
  if (entry === undefined) throw new SceneHistoryBoundary("undo");
  return {
    ...session,
    current: restoreAtRevision(entry.before, nextInteger(session.current.revision, "Scene Project revision")),
    cursor: session.cursor - 1,
    position: entry.beforePosition,
  };
}

export function redoSceneEdit(session: SceneEditSession): SceneEditSession {
  assertSceneEditSession(session);
  const entry = session.history[session.cursor];
  if (entry === undefined) throw new SceneHistoryBoundary("redo");
  return {
    ...session,
    current: restoreAtRevision(entry.after, nextInteger(session.current.revision, "Scene Project revision")),
    cursor: session.cursor + 1,
    position: entry.afterPosition,
  };
}

export function markSceneEditSessionSaved(session: SceneEditSession): SceneEditSession {
  assertSceneEditSession(session);
  return { ...session, savepoint: session.position };
}

export function isSceneEditSessionDirty(session: SceneEditSession): boolean {
  assertSceneEditSession(session);
  return session.savepoint === undefined || session.savepoint !== session.position;
}

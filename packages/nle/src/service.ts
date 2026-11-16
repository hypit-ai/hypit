import { assertNleProject, sealNleProject } from "./project.js";
import { applyNleTransaction, type NleCommand } from "./transaction.js";
import type { NleProject } from "./types.js";

function assertRevision(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

export class NleRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`NLE Service changed: expected revision ${expected}, found ${actual}.`);
    this.name = "NleRevisionConflict";
  }
}

export type NleServiceTransaction = {
  readonly expectedRevision: number;
  readonly commands: readonly NleCommand[];
};

export type NleServiceSnapshot = {
  readonly project: NleProject;
  /** Process-local generation of this open Service. It resets when the Project is reopened. */
  readonly revision: number;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};

export type NleServiceChange = {
  readonly kind: "transaction" | "undo" | "redo" | "savepoint" | "reload";
  readonly snapshot: NleServiceSnapshot;
};

export type NleServiceListener = (change: NleServiceChange) => void;

type HistoryState = {
  readonly project: NleProject;
  readonly stateId: number;
};

/**
 * The real open lifetime of one NLE Project.
 *
 * Hosts create one instance for each open Project document and share it between Views, Agents and CLIs.
 * Persistence remains an explicit Host operation: serialize `snapshot.project`, write it, then call
 * `markSaved`. No hash loop or implicit file watcher participates in this owner state.
 */
export class NleProjectService {
  #current: HistoryState;
  #undo: HistoryState[] = [];
  #redo: HistoryState[] = [];
  #savedStateId = 0;
  #nextStateId = 1;
  #revision = 0;
  readonly #listeners = new Set<NleServiceListener>();

  constructor(project: NleProject) {
    this.#current = { project: sealNleProject(project), stateId: 0 };
  }

  snapshot(): NleServiceSnapshot {
    return {
      project: structuredClone(this.#current.project),
      revision: this.#revision,
      dirty: this.#current.stateId !== this.#savedStateId,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
    };
  }

  subscribe(listener: NleServiceListener): () => void {
    if (typeof listener !== "function") throw new Error("NLE Service listener must be a function.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #requireRevision(expected: number): void {
    assertRevision(expected, "NLE Service expected revision");
    if (expected !== this.#revision) throw new NleRevisionConflict(expected, this.#revision);
  }

  #emit(kind: NleServiceChange["kind"]): NleServiceSnapshot {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener({ kind, snapshot: structuredClone(snapshot) });
      } catch {
        // Observation cannot veto or partially roll back an already committed owner mutation.
      }
    }
    return snapshot;
  }

  transact(value: NleServiceTransaction): NleServiceSnapshot {
    this.#requireRevision(value.expectedRevision);
    const next = applyNleTransaction(this.#current.project, { commands: value.commands });
    this.#undo.push(this.#current);
    this.#redo = [];
    this.#current = { project: next, stateId: this.#nextStateId++ };
    this.#revision += 1;
    return this.#emit("transaction");
  }

  undo(expectedRevision: number): NleServiceSnapshot {
    this.#requireRevision(expectedRevision);
    const previous = this.#undo.pop();
    if (previous === undefined) throw new Error("NLE Service has no transaction to undo.");
    this.#redo.push(this.#current);
    this.#current = previous;
    this.#revision += 1;
    return this.#emit("undo");
  }

  redo(expectedRevision: number): NleServiceSnapshot {
    this.#requireRevision(expectedRevision);
    const next = this.#redo.pop();
    if (next === undefined) throw new Error("NLE Service has no transaction to redo.");
    this.#undo.push(this.#current);
    this.#current = next;
    this.#revision += 1;
    return this.#emit("redo");
  }

  /** Mark the current state as durably saved after the Host has completed its explicit file write. */
  markSaved(expectedRevision: number): NleServiceSnapshot {
    this.#requireRevision(expectedRevision);
    this.#savedStateId = this.#current.stateId;
    return this.#emit("savepoint");
  }

  /** Explicitly accept a newly read version of the same Project document and start fresh history. */
  reload(project: NleProject, expectedRevision: number): NleServiceSnapshot {
    this.#requireRevision(expectedRevision);
    assertNleProject(project);
    if (project.id !== this.#current.project.id) {
      throw new Error(`NLE Service for ${this.#current.project.id} cannot reload Project ${project.id}.`);
    }
    const stateId = this.#nextStateId++;
    this.#current = { project: sealNleProject(project), stateId };
    this.#undo = [];
    this.#redo = [];
    this.#savedStateId = stateId;
    this.#revision += 1;
    return this.#emit("reload");
  }
}

export function openNleProjectService(project: NleProject): NleProjectService {
  return new NleProjectService(project);
}

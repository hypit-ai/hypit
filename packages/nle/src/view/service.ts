import type { NleProject } from "../types.js";
import { applyNleViewTransaction, type NleViewCommand } from "./transaction.js";
import type { NleView } from "./types.js";
import { assertNleView, reconcileNleView, sealNleView } from "./view.js";

function assertRevision(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

export class NleViewRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`NLE View Service changed: expected revision ${expected}, found ${actual}.`);
    this.name = "NleViewRevisionConflict";
  }
}

export type NleViewServiceTransaction = {
  readonly expectedRevision: number;
  readonly commands: readonly NleViewCommand[];
};

export type NleViewServiceSnapshot = {
  readonly view: NleView;
  /** Process-local generation of this open View Service. */
  readonly revision: number;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};

export type NleViewServiceChange = {
  readonly kind: "transaction" | "undo" | "redo" | "reconcile" | "savepoint" | "reload";
  readonly snapshot: NleViewServiceSnapshot;
};

export type NleViewServiceListener = (change: NleViewServiceChange) => void;

type HistoryState = {
  readonly view: NleView;
  readonly stateId: number;
};

/** One open lifetime for one NLE View document, independent from its Project Service. */
export class NleViewService {
  #current: HistoryState;
  #undo: HistoryState[] = [];
  #redo: HistoryState[] = [];
  #savedStateId = 0;
  #nextStateId = 1;
  #revision = 0;
  readonly #listeners = new Set<NleViewServiceListener>();

  constructor(view: NleView) {
    this.#current = { view: sealNleView(view), stateId: 0 };
  }

  snapshot(): NleViewServiceSnapshot {
    return {
      view: structuredClone(this.#current.view),
      revision: this.#revision,
      dirty: this.#current.stateId !== this.#savedStateId,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
    };
  }

  subscribe(listener: NleViewServiceListener): () => void {
    if (typeof listener !== "function") throw new Error("NLE View Service listener must be a function.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #requireRevision(expected: number): void {
    assertRevision(expected, "NLE View Service expected revision");
    if (expected !== this.#revision) throw new NleViewRevisionConflict(expected, this.#revision);
  }

  #emit(kind: NleViewServiceChange["kind"]): NleViewServiceSnapshot {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      try {
        listener({ kind, snapshot: structuredClone(snapshot) });
      } catch {
        // Observation cannot veto an already committed owner mutation.
      }
    }
    return snapshot;
  }

  #commit(view: NleView, kind: "transaction" | "reconcile"): NleViewServiceSnapshot {
    this.#undo.push(this.#current);
    this.#redo = [];
    this.#current = { view, stateId: this.#nextStateId++ };
    this.#revision += 1;
    return this.#emit(kind);
  }

  transact(value: NleViewServiceTransaction, project: NleProject): NleViewServiceSnapshot {
    this.#requireRevision(value.expectedRevision);
    return this.#commit(applyNleViewTransaction(this.#current.view, project, {
      commands: value.commands,
    }), "transaction");
  }

  /** Explicitly clean stale Project references after the caller accepts a Project snapshot. */
  reconcile(project: NleProject, expectedRevision: number): NleViewServiceSnapshot {
    this.#requireRevision(expectedRevision);
    const next = reconcileNleView(this.#current.view, project);
    if (JSON.stringify(next) === JSON.stringify(this.#current.view)) return this.snapshot();
    return this.#commit(next, "reconcile");
  }

  undo(expectedRevision: number): NleViewServiceSnapshot {
    this.#requireRevision(expectedRevision);
    const previous = this.#undo.pop();
    if (previous === undefined) throw new Error("NLE View Service has no transaction to undo.");
    this.#redo.push(this.#current);
    this.#current = previous;
    this.#revision += 1;
    return this.#emit("undo");
  }

  redo(expectedRevision: number): NleViewServiceSnapshot {
    this.#requireRevision(expectedRevision);
    const next = this.#redo.pop();
    if (next === undefined) throw new Error("NLE View Service has no transaction to redo.");
    this.#undo.push(this.#current);
    this.#current = next;
    this.#revision += 1;
    return this.#emit("redo");
  }

  markSaved(expectedRevision: number): NleViewServiceSnapshot {
    this.#requireRevision(expectedRevision);
    this.#savedStateId = this.#current.stateId;
    return this.#emit("savepoint");
  }

  /** Explicitly accept newly read bytes for the same View document and reset history. */
  reload(view: NleView, expectedRevision: number): NleViewServiceSnapshot {
    this.#requireRevision(expectedRevision);
    assertNleView(view);
    if (view.id !== this.#current.view.id) {
      throw new Error(`NLE View Service for ${this.#current.view.id} cannot reload View ${view.id}.`);
    }
    const stateId = this.#nextStateId++;
    this.#current = { view: sealNleView(view), stateId };
    this.#undo = [];
    this.#redo = [];
    this.#savedStateId = stateId;
    this.#revision += 1;
    return this.#emit("reload");
  }
}

export function openNleViewService(view: NleView): NleViewService {
  return new NleViewService(view);
}

import type { NleEditingSurfaceCommand } from "@hypit/nle/surface";
import type { NleStudioSession } from "../protocol.js";

export type EditorFocus = { readonly composition: string; readonly frame: number; readonly selection: readonly string[] };
type Change = { readonly project: number; readonly view: number };
type Entry = { readonly changes: readonly Change[]; readonly before: EditorFocus; readonly after: EditorFocus };

/** Browser gesture order over the two independent owner histories. */
export class EditingHistory {
  #undo: Entry[] = [];
  #redo: Entry[] = [];
  #pending: Change[] | undefined;
  #before: EditorFocus | undefined;
  #anchor: { project: string; path: string; projectRevision: number; viewRevision: number } | undefined;
  #key = `hypit:nle:history:${location.pathname}`;
  #persist() {
    try { sessionStorage.setItem(this.#key, JSON.stringify({ anchor: this.#anchor, undo: this.#undo, redo: this.#redo })); } catch {}
  }
  begin(focus: EditorFocus | undefined) { this.#pending = []; this.#before = focus; }
  observe(before: NleStudioSession | undefined, after: NleStudioSession) {
    const anchor = { project: after.open.project.project.id, path: after.projectDocument.path, projectRevision: after.open.status.projectRevision, viewRevision: after.open.status.viewRevision };
    if (!before) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(this.#key) ?? "null");
        if (saved && JSON.stringify(saved.anchor) === JSON.stringify(anchor) && Array.isArray(saved.undo) && Array.isArray(saved.redo)) { this.#undo = saved.undo; this.#redo = saved.redo; }
      } catch {}
      this.#anchor = anchor; return;
    }
    if (before.open.project.project.id !== after.open.project.project.id || before.projectDocument.path !== after.projectDocument.path) this.reset();
    this.#anchor = anchor;
    if (!this.#pending) return;
    const project = after.open.status.projectRevision - before.open.status.projectRevision;
    const view = after.open.status.viewRevision - before.open.status.viewRevision;
    if (project > 0 || view > 0) this.#pending.push({ project, view });
  }
  finish(focus: EditorFocus | undefined) {
    if (this.#pending?.length && this.#before && focus) { this.#undo.push({ changes: this.#pending, before: this.#before, after: focus }); this.#redo = []; }
    this.#pending = undefined; this.#before = undefined; this.#persist();
  }
  reset() { this.#undo = []; this.#redo = []; this.#pending = undefined; this.#before = undefined; try { sessionStorage.removeItem(this.#key); } catch {} }
  available(session: NleStudioSession | undefined, direction: "undo" | "redo") {
    return Boolean(session && (session.open.status.projectHistory[direction === "undo" ? "canUndo" : "canRedo"] || session.open.status.viewHistory[direction === "undo" ? "canUndo" : "canRedo"]));
  }
  async replay(direction: "undo" | "redo", session: NleStudioSession, send: (command: NleEditingSurfaceCommand, viewRevision: number) => Promise<NleStudioSession>, receive: (session: NleStudioSession) => void): Promise<EditorFocus | undefined> {
    const source = direction === "undo" ? this.#undo : this.#redo, target = direction === "undo" ? this.#redo : this.#undo;
    const entry = source.at(-1);
    const fallback = session.open.status.projectHistory[direction === "undo" ? "canUndo" : "canRedo"] ? { project: 1, view: 0 } : { project: 0, view: 1 };
    const changes = entry ? direction === "undo" ? [...entry.changes].reverse() : entry.changes : [fallback];
    let current = session;
    try {
      for (const change of changes) {
        // Restore Project subjects before restoring their View references. Redo removes View references first.
        const owners = direction === "undo" ? ["project", "view"] as const : ["view", "project"] as const;
        for (const owner of owners) for (let step = 0; step < change[owner]; step++) {
          const command: NleEditingSurfaceCommand = owner === "project"
            ? { kind: direction === "undo" ? "project.undo" : "project.redo", expectedProjectRevision: current.open.status.projectRevision }
            : { kind: direction === "undo" ? "view.undo" : "view.redo", expectedViewRevision: current.open.status.viewRevision };
          current = await send(command, current.open.status.viewRevision); receive(current);
        }
      }
      if (entry) { source.pop(); target.push(entry); this.#persist(); return direction === "undo" ? entry.before : entry.after; }
    } catch (error) { this.reset(); throw error; }
    return undefined;
  }
}

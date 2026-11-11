import type { SceneProject, SceneTransaction } from "@hypit/scene";
import type { TemporalRate } from "@hypit/temporal/algebra";

import type { SceneView, SceneViewGrid } from "./types.js";
import { assertSceneViewForProject } from "./view.js";

export type SceneViewCommand =
  | { readonly kind: "view.update"; readonly name?: string; readonly editRate?: TemporalRate }
  | { readonly kind: "grid.update"; readonly grid: SceneViewGrid }
  | { readonly kind: "object-state.set"; readonly object: string; readonly hidden?: boolean; readonly locked?: boolean }
  | { readonly kind: "track-lock.set"; readonly performance: string; readonly track: string; readonly locked: boolean };

export type SceneViewTransaction = {
  readonly revision: number;
  readonly commands: readonly SceneViewCommand[];
};

export class SceneViewRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Scene View changed: expected revision ${expected}, found ${actual}.`);
    this.name = "SceneViewRevisionConflict";
  }
}

type MutableView = Omit<SceneView, "revision" | "name" | "editRate" | "grid" | "objects" | "tracks"> & {
  revision: number;
  name: string;
  editRate: TemporalRate;
  grid: SceneViewGrid;
  objects: { object: string; hidden: boolean; locked: boolean }[];
  tracks: { performance: string; track: string; locked: boolean }[];
};

/** Editing-surface guard. Scene Core itself is independent of View locks. */
export function assertSceneViewAllowsTransaction(
  view: SceneView,
  project: SceneProject,
  transaction: SceneTransaction,
): void {
  assertSceneViewForProject(view, project);
  const lockedObjects = new Set(view.objects.filter((entry) => entry.locked).map((entry) => entry.object));
  const lockedTracks = new Set(view.tracks.filter((entry) => entry.locked)
    .map((entry) => `${entry.performance}\u0000${entry.track}`));
  for (const command of transaction.commands) {
    if ((command.kind === "object.replace" && lockedObjects.has(command.object.id))
      || (command.kind === "object.transform.set" && lockedObjects.has(command.id))
      || (command.kind === "object.remove" && lockedObjects.has(command.id))) {
      throw new Error(`Scene Object ${command.kind === "object.replace" ? command.object.id : command.id} is locked.`);
    }
    if ((command.kind === "track.replace" || command.kind === "track.remove")
      && lockedTracks.has(`${command.performance}\u0000${command.kind === "track.replace" ? command.track.id : command.id}`)) {
      throw new Error(`Scene Track ${command.kind === "track.replace" ? command.track.id : command.id} is locked.`);
    }
    if ((command.kind === "performance-item.add" || command.kind === "performance-item.replace"
      || command.kind === "performance-item.remove")
      && lockedTracks.has(`${command.performance}\u0000${command.track}`)) {
      throw new Error(`Scene Track ${command.track} is locked.`);
    }
  }
}

export function applySceneViewTransaction(
  view: SceneView,
  project: SceneProject,
  transaction: SceneViewTransaction,
): SceneView {
  assertSceneViewForProject(view, project);
  if (transaction.revision !== view.revision) {
    throw new SceneViewRevisionConflict(transaction.revision, view.revision);
  }
  const next = structuredClone(view) as MutableView;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "view.update":
        if (command.name !== undefined) next.name = command.name;
        if (command.editRate !== undefined) next.editRate = structuredClone(command.editRate);
        break;
      case "grid.update": next.grid = structuredClone(command.grid); break;
      case "object-state.set": {
        if (!project.objects.some((entry) => entry.id === command.object)) {
          throw new Error(`Unknown Scene Object: ${command.object}`);
        }
        let state = next.objects.find((entry) => entry.object === command.object);
        if (state === undefined) {
          state = { object: command.object, hidden: false, locked: false };
          next.objects.push(state);
        }
        if (command.hidden !== undefined) state.hidden = command.hidden;
        if (command.locked !== undefined) state.locked = command.locked;
        break;
      }
      case "track-lock.set": {
        const performance = project.performances.find((entry) => entry.id === command.performance);
        if (performance === undefined || !performance.tracks.some((entry) => entry.id === command.track)) {
          throw new Error(`Unknown Scene Track: ${command.track}`);
        }
        let state = next.tracks.find((entry) => entry.performance === command.performance && entry.track === command.track);
        if (state === undefined) {
          state = { performance: command.performance, track: command.track, locked: command.locked };
          next.tracks.push(state);
        } else state.locked = command.locked;
        break;
      }
    }
  }
  next.revision += 1;
  assertSceneViewForProject(next, project);
  return structuredClone(next);
}

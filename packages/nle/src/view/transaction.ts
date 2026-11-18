import type { TemporalRate } from "@hypit/temporal/algebra";
import type { NleProject } from "../types.js";
import type { NleEditGroup, NleView, NleViewCompositionState } from "./types.js";
import { assertNleViewForProject } from "./view.js";

export type NleViewCommand =
  | {
      readonly kind: "view.update";
      readonly name?: string;
      readonly activeComposition?: string;
      readonly editRate?: TemporalRate;
    }
  | {
      readonly kind: "track-lock.set";
      readonly composition: string;
      readonly track: string;
      readonly locked: boolean;
    }
  | {
      readonly kind: "track-height.set";
      readonly composition: string;
      readonly track: string;
      readonly heightPx: number | null;
    }
  | { readonly kind: "track-order.set"; readonly composition: string; readonly tracks: readonly string[] }
  | { readonly kind: "group.add"; readonly composition: string; readonly group: NleEditGroup }
  | { readonly kind: "group.replace"; readonly composition: string; readonly group: NleEditGroup }
  | { readonly kind: "group.remove"; readonly composition: string; readonly id: string };

export type NleViewTransaction = {
  readonly commands: readonly NleViewCommand[];
};

type MutableCompositionState = {
  composition: string;
  tracks: { track: string; locked: boolean; heightPx?: number }[];
  groups: NleEditGroup[];
  trackOrder?: string[];
};

type MutableView = Omit<NleView, "name" | "activeComposition" | "editRate" | "compositions"> & {
  name: string;
  activeComposition: string;
  editRate: TemporalRate;
  compositions: MutableCompositionState[];
};

function projectComposition(project: NleProject, id: string) {
  const composition = project.compositions.find((candidate) => candidate.id === id);
  if (composition === undefined) throw new Error(`Unknown NLE Composition: ${id}.`);
  return composition;
}

function requireTrack(project: NleProject, composition: string, track: string): void {
  if (!projectComposition(project, composition).tracks.some((candidate) => candidate.id === track)) {
    throw new Error(`Unknown NLE Track ${track} in Composition ${composition}.`);
  }
}

function mutableComposition(view: MutableView, composition: string): MutableCompositionState {
  let state = view.compositions.find((candidate) => candidate.composition === composition);
  if (state === undefined) {
    state = { composition, tracks: [], groups: [] };
    view.compositions.push(state);
  }
  return state;
}

export function applyNleViewTransaction(
  view: NleView,
  project: NleProject,
  transaction: NleViewTransaction,
): NleView {
  assertNleViewForProject(view, project);
  const next = structuredClone(view) as MutableView;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "view.update":
        if (command.name !== undefined) next.name = command.name;
        if (command.activeComposition !== undefined) {
          projectComposition(project, command.activeComposition);
          next.activeComposition = command.activeComposition;
        }
        if (command.editRate !== undefined) next.editRate = structuredClone(command.editRate);
        break;
      case "track-lock.set": {
        requireTrack(project, command.composition, command.track);
        const state = mutableComposition(next, command.composition);
        const current = state.tracks.find((track) => track.track === command.track);
        if (current === undefined) state.tracks.push({ track: command.track, locked: command.locked });
        else current.locked = command.locked;
        break;
      }
      case "track-height.set": {
        requireTrack(project, command.composition, command.track);
        if (command.heightPx !== null && (!Number.isSafeInteger(command.heightPx)
          || command.heightPx < 32 || command.heightPx > 240)) {
          throw new Error("NLE View Track height must be an integer from 32 through 240 pixels.");
        }
        const state = mutableComposition(next, command.composition);
        let current = state.tracks.find((track) => track.track === command.track);
        if (current === undefined) {
          current = { track: command.track, locked: false };
          state.tracks.push(current);
        }
        if (command.heightPx === null) delete current.heightPx;
        else current.heightPx = command.heightPx;
        break;
      }
      case "track-order.set": {
        const composition = projectComposition(project, command.composition);
        const knownTracks = new Set(composition.tracks.map((track) => track.id));
        for (const track of command.tracks) {
          if (!knownTracks.has(track)) throw new Error(`Unknown NLE Track ${track} in Composition ${composition.id}.`);
        }
        mutableComposition(next, composition.id).trackOrder = [...command.tracks];
        break;
      }
      case "group.add":
        projectComposition(project, command.composition);
        mutableComposition(next, command.composition).groups.push(structuredClone(command.group));
        break;
      case "group.replace": {
        projectComposition(project, command.composition);
        const groups = mutableComposition(next, command.composition).groups;
        const index = groups.findIndex((group) => group.id === command.group.id);
        if (index < 0) throw new Error(`Unknown NLE View Group: ${command.group.id}.`);
        groups.splice(index, 1, structuredClone(command.group));
        break;
      }
      case "group.remove": {
        projectComposition(project, command.composition);
        const groups = mutableComposition(next, command.composition).groups;
        const index = groups.findIndex((group) => group.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE View Group: ${command.id}.`);
        groups.splice(index, 1);
        break;
      }
      default:
        throw new Error(`Unknown NLE View command: ${String((command as { readonly kind?: unknown }).kind)}.`);
    }
  }
  assertNleViewForProject(next, project);
  return structuredClone(next) as NleView;
}

export function nleViewCompositionState(
  view: NleView,
  composition: string,
): NleViewCompositionState | undefined {
  return view.compositions.find((state) => state.composition === composition);
}

import type { NleProject, NleTransaction } from "@hypit/nle";
import type { TemporalRate } from "@hypit/temporal/algebra";

import type { NleTimelineGroup, NleTimelineView } from "./types.js";
import { assertNleTimelineViewForProject } from "./view.js";

export type NleTimelineViewCommand =
  | { readonly kind: "view.update"; readonly name?: string; readonly editRate?: TemporalRate }
  | { readonly kind: "track-lock.set"; readonly track: string; readonly locked: boolean }
  | { readonly kind: "track-height.set"; readonly track: string; readonly heightPx: number | null }
  | { readonly kind: "group.add"; readonly group: NleTimelineGroup }
  | { readonly kind: "group.replace"; readonly group: NleTimelineGroup }
  | { readonly kind: "group.remove"; readonly id: string };

export type NleTimelineViewTransaction = {
  readonly revision: number;
  readonly commands: readonly NleTimelineViewCommand[];
};

export class NleTimelineViewRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`NLE Timeline View changed: expected revision ${expected}, found ${actual}.`);
    this.name = "NleTimelineViewRevisionConflict";
  }
}

type MutableView = Omit<NleTimelineView, "revision" | "name" | "editRate" | "tracks" | "groups"> & {
  revision: number;
  name: string;
  editRate: TemporalRate;
  tracks: { track: string; locked: boolean; heightPx?: number }[];
  groups: NleTimelineGroup[];
};

/** Apply this guard at an editing surface boundary before committing the Project transaction. */
export function assertNleTimelineViewAllowsTransaction(
  view: NleTimelineView,
  project: NleProject,
  transaction: NleTransaction,
): void {
  assertNleTimelineViewForProject(view, project);
  const locked = new Set(view.tracks.filter((state) => state.locked).map((state) => state.track));
  const itemTrack = (id: string): string => {
    for (const track of project.tracks) {
      if (track.items.some((item) => item.id === id)) return track.id;
    }
    throw new Error(`Unknown NLE Item: ${id}`);
  };
  const requireMediaTimeItems = (items: readonly string[], operation: string): void => {
    for (const id of new Set(items)) {
      const item = project.tracks.flatMap((track) => track.items).find((candidate) => candidate.id === id);
      if (item === undefined) throw new Error(`Unknown NLE Item: ${id}`);
      if (item.kind !== "present" || item.source !== "media") {
        throw new Error(`NLE Timeline ${operation} is available only for Media Items; ${id} is ${item.kind === "adjustment" ? "an Adjustment" : `a ${item.source} Present`}.`);
      }
    }
  };
  const requireTracks = (tracks: readonly string[]): void => {
    for (const track of new Set(tracks)) {
      if (locked.has(track)) throw new Error(`NLE Timeline Track ${track} is locked.`);
    }
  };
  const requireItems = (items: readonly string[]): void => requireTracks(items.map(itemTrack));
  const transition = (id: string) => {
    const value = project.transitions.find((candidate) => candidate.id === id);
    if (value === undefined) throw new Error(`Unknown NLE Transition: ${id}`);
    return value;
  };
  const matte = (id: string) => {
    const value = project.mattes.find((candidate) => candidate.id === id);
    if (value === undefined) throw new Error(`Unknown NLE Matte: ${id}`);
    return value;
  };
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "component-value.replace":
        requireItems(project.tracks.flatMap((track) => track.items.flatMap((item) =>
          item.kind === "present" && item.source === "component"
            && item.bindings?.some((binding) => binding.ref === command.value.id)
            ? [item.id] : [])));
        break;
      case "picture-layout.replace":
        requireItems(project.tracks.flatMap((track) => track.items.flatMap((item) =>
          item.kind === "present" && item.picture !== undefined && Object.hasOwn(item.picture.layout, "ref")
            && (item.picture.layout as { readonly ref: string }).ref === command.value.id ? [item.id] : [])));
        break;
      case "track.move":
      case "track.remove":
        requireTracks([command.id]);
        break;
      case "track.replace":
        requireTracks([command.track.id]);
        break;
      case "item.add":
        requireTracks([command.track]);
        break;
      case "item.update":
        requireItems([command.id]);
        break;
      case "item.move":
        requireItems(command.ids);
        if (command.track !== undefined) requireTracks([command.track]);
        break;
      case "item.trim":
        requireItems([command.id]);
        requireMediaTimeItems([command.id], "trim");
        break;
      case "item.slip":
      case "item.retime":
        requireItems([command.id]);
        requireMediaTimeItems([command.id], command.kind === "item.slip" ? "slip" : "retime");
        break;
      case "item.replace":
        requireItems([command.item.id]);
        break;
      case "item.roll":
        requireItems([command.left, command.right]);
        requireMediaTimeItems([command.left, command.right], "roll");
        break;
      case "item.ripple-trim":
        requireItems([command.id, ...command.scope]);
        requireMediaTimeItems([command.id], "ripple trim");
        break;
      case "item.split":
        requireItems([command.id]);
        requireMediaTimeItems([command.id], "split");
        break;
      case "item.detach-audio":
        requireItems([command.id]);
        requireMediaTimeItems([command.id], "detach audio");
        requireTracks([command.track]);
        break;
      case "item.remove":
        requireItems(command.ids);
        break;
      case "transition.add":
        requireItems([command.transition.outgoing, command.transition.incoming]);
        break;
      case "transition.replace": {
        const current = transition(command.transition.id);
        requireItems([current.outgoing, current.incoming, command.transition.outgoing, command.transition.incoming]);
        break;
      }
      case "transition.remove": {
        const current = transition(command.id);
        requireItems([current.outgoing, current.incoming]);
        break;
      }
      case "matte.add":
        requireItems([command.matte.content, command.matte.matte]);
        break;
      case "matte.replace": {
        const current = matte(command.matte.id);
        requireItems([current.content, current.matte, command.matte.content, command.matte.matte]);
        break;
      }
      case "matte.remove": {
        const current = matte(command.id);
        requireItems([current.content, current.matte]);
        break;
      }
      default:
        break;
    }
  }
}

export function applyNleTimelineViewTransaction(
  view: NleTimelineView,
  project: NleProject,
  transaction: NleTimelineViewTransaction,
): NleTimelineView {
  assertNleTimelineViewForProject(view, project);
  if (transaction.revision !== view.revision) {
    throw new NleTimelineViewRevisionConflict(transaction.revision, view.revision);
  }
  const next = structuredClone(view) as MutableView;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "view.update":
        if (command.name !== undefined) next.name = command.name;
        if (command.editRate !== undefined) next.editRate = structuredClone(command.editRate);
        break;
      case "track-lock.set": {
        if (!project.tracks.some((track) => track.id === command.track)) {
          throw new Error(`Unknown NLE Track: ${command.track}`);
        }
        const current = next.tracks.find((state) => state.track === command.track);
        if (current === undefined) next.tracks.push({ track: command.track, locked: command.locked });
        else current.locked = command.locked;
        break;
      }
      case "track-height.set": {
        if (!project.tracks.some((track) => track.id === command.track)) {
          throw new Error(`Unknown NLE Track: ${command.track}`);
        }
        if (command.heightPx !== null && (!Number.isSafeInteger(command.heightPx)
          || command.heightPx < 32 || command.heightPx > 240)) {
          throw new Error("NLE Timeline Track height must be an integer from 32 through 240 pixels.");
        }
        let current = next.tracks.find((state) => state.track === command.track);
        if (current === undefined) {
          current = { track: command.track, locked: false };
          next.tracks.push(current);
        }
        if (command.heightPx === null) delete current.heightPx;
        else current.heightPx = command.heightPx;
        break;
      }
      case "group.add":
        next.groups.push(structuredClone(command.group));
        break;
      case "group.replace": {
        const index = next.groups.findIndex((group) => group.id === command.group.id);
        if (index < 0) throw new Error(`Unknown NLE Timeline Group: ${command.group.id}`);
        next.groups.splice(index, 1, structuredClone(command.group));
        break;
      }
      case "group.remove": {
        const index = next.groups.findIndex((group) => group.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Timeline Group: ${command.id}`);
        next.groups.splice(index, 1);
        break;
      }
    }
  }
  next.revision += 1;
  assertNleTimelineViewForProject(next, project);
  return structuredClone(next);
}

import {
  assertNleProject,
} from "./project.js";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import type {
  NleGroup,
  NleItem,
  NleMatte,
  NleMedia,
  NleProject,
  NleTrack,
  NleTransition,
} from "./types.js";

export type NleCommand =
  | { readonly kind: "media.add"; readonly media: NleMedia }
  | { readonly kind: "media.replace"; readonly media: NleMedia }
  | { readonly kind: "media.remove"; readonly id: string }
  | { readonly kind: "track.add"; readonly track: NleTrack; readonly before?: string }
  | { readonly kind: "track.move"; readonly id: string; readonly before?: string }
  | { readonly kind: "track.replace"; readonly track: NleTrack }
  | { readonly kind: "track.remove"; readonly id: string }
  | { readonly kind: "item.add"; readonly track: string; readonly item: NleItem; readonly before?: string }
  | {
      readonly kind: "item.move";
      readonly ids: readonly string[];
      readonly delta: ExactTemporalValue;
      readonly track?: string;
    }
  | { readonly kind: "item.trim"; readonly id: string; readonly edge: "start" | "end"; readonly at: ExactTemporalValue }
  | { readonly kind: "item.split"; readonly id: string; readonly at: ExactTemporalValue; readonly rightId: string }
  | { readonly kind: "item.replace"; readonly item: NleItem }
  | { readonly kind: "item.remove"; readonly ids: readonly string[] }
  | { readonly kind: "transition.add"; readonly transition: NleTransition }
  | { readonly kind: "transition.replace"; readonly transition: NleTransition }
  | { readonly kind: "transition.remove"; readonly id: string }
  | { readonly kind: "matte.add"; readonly matte: NleMatte }
  | { readonly kind: "matte.replace"; readonly matte: NleMatte }
  | { readonly kind: "matte.remove"; readonly id: string }
  | { readonly kind: "group.add"; readonly group: NleGroup }
  | { readonly kind: "group.replace"; readonly group: NleGroup }
  | { readonly kind: "group.remove"; readonly id: string };

export type NleTransaction = {
  readonly revision: number;
  readonly commands: readonly NleCommand[];
};

export class NleRevisionConflict extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`NLE Project changed: expected revision ${expected}, found ${actual}.`);
    this.name = "NleRevisionConflict";
  }
}

type MutableTrack = Omit<NleTrack, "items"> & { items: NleItem[] };
type MutableProject = Omit<NleProject, "revision" | "media" | "tracks"> & {
  revision: number;
  media: NleMedia[];
  tracks: MutableTrack[];
  transitions: NleTransition[];
  mattes: NleMatte[];
  groups: NleGroup[];
};

function mutableTrack(project: MutableProject, id: string): MutableTrack {
  const track = project.tracks.find((candidate) => candidate.id === id);
  if (track === undefined) throw new Error(`Unknown NLE Track: ${id}`);
  return track;
}

function mutableItem(project: MutableProject, id: string): { track: MutableTrack; item: NleItem } {
  for (const track of project.tracks) {
    const item = track.items.find((candidate) => candidate.id === id);
    if (item !== undefined) return { track, item };
  }
  throw new Error(`Unknown NLE Item: ${id}`);
}

function editable(track: NleTrack): void {
  if (track.locked) throw new Error(`NLE Track ${track.id} is locked.`);
}

function insert<T extends { readonly id: string }>(values: readonly T[], value: T, before?: string): T[] {
  const next = [...values];
  const index = before === undefined ? next.length : next.findIndex((candidate) => candidate.id === before);
  if (index < 0) throw new Error(`Unknown insertion target: ${before}.`);
  next.splice(index, 0, value);
  return next;
}

/** One user gesture produces one immutable revision or no revision at all. */
export function applyNleTransaction(project: NleProject, transaction: NleTransaction): NleProject {
  assertNleProject(project);
  if (transaction.revision !== project.revision) {
    throw new NleRevisionConflict(transaction.revision, project.revision);
  }
  const next = structuredClone(project) as MutableProject;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "media.add":
        next.media.push(structuredClone(command.media));
        break;
      case "media.replace": {
        const index = next.media.findIndex((candidate) => candidate.id === command.media.id);
        if (index < 0) throw new Error(`Unknown NLE Media: ${command.media.id}`);
        next.media.splice(index, 1, structuredClone(command.media));
        break;
      }
      case "media.remove":
        if (!next.media.some((candidate) => candidate.id === command.id)) {
          throw new Error(`Unknown NLE Media: ${command.id}`);
        }
        if (next.tracks.some((track) => track.items.some((item) =>
          item.kind === "media" && item.media === command.id))) {
          throw new Error(`NLE Media ${command.id} is still used by an Item.`);
        }
        next.media.splice(next.media.findIndex((entry) => entry.id === command.id), 1);
        break;
      case "track.add":
        next.tracks = insert(next.tracks, structuredClone(command.track) as MutableTrack, command.before);
        break;
      case "track.move": {
        const track = mutableTrack(next, command.id);
        editable(track);
        const remaining = next.tracks.filter((candidate) => candidate.id !== command.id);
        next.tracks = insert(remaining, track, command.before);
        break;
      }
      case "track.replace": {
        const current = mutableTrack(next, command.track.id);
        editable(current);
        next.tracks.splice(next.tracks.indexOf(current), 1, structuredClone(command.track) as MutableTrack);
        break;
      }
      case "track.remove": {
        const track = mutableTrack(next, command.id);
        editable(track);
        if (track.items.length > 0) throw new Error(`NLE Track ${track.id} still contains Items.`);
        next.tracks.splice(next.tracks.indexOf(track), 1);
        break;
      }
      case "item.add": {
        const track = mutableTrack(next, command.track);
        editable(track);
        track.items = insert(track.items, structuredClone(command.item), command.before);
        break;
      }
      case "item.move": {
        const ids = [...new Set(command.ids)];
        assertExactTemporalValue(command.delta, "NLE Item move delta");
        const destination = command.track === undefined ? undefined : mutableTrack(next, command.track);
        if (destination !== undefined) editable(destination);
        for (const id of ids) {
          const { track, item } = mutableItem(next, id);
          editable(track);
          (item as { start: ExactTemporalValue }).start = addExactTemporalValues(item.start, command.delta);
          if (destination !== undefined && destination.id !== track.id) {
            track.items = track.items.filter((candidate) => candidate.id !== id);
            destination.items = [...destination.items, item];
          }
        }
        break;
      }
      case "item.trim": {
        const { track, item } = mutableItem(next, command.id);
        editable(track);
        assertExactTemporalValue(command.at, "NLE Item trim position");
        if (command.edge === "start") {
          const delta = subtractExactTemporalValues(command.at, item.start);
          (item as { start: ExactTemporalValue }).start = structuredClone(command.at);
          (item as { duration: ExactTemporalValue }).duration = subtractExactTemporalValues(item.duration, delta);
          (item as { localStart: ExactTemporalValue }).localStart = addExactTemporalValues(item.localStart, delta);
        } else {
          (item as { duration: ExactTemporalValue }).duration = subtractExactTemporalValues(command.at, item.start);
        }
        break;
      }
      case "item.split": {
        const { track, item } = mutableItem(next, command.id);
        editable(track);
        assertExactTemporalValue(command.at, "NLE Item split position");
        const offset = subtractExactTemporalValues(command.at, item.start);
        if (compareExactTemporalValues(offset, item.duration) >= 0
          || compareExactTemporalValues(offset, exactTemporalZero()) <= 0) {
          throw new Error("NLE split must lie inside the Item.");
        }
        const right = structuredClone(item) as NleItem;
        (right as { id: string }).id = command.rightId;
        (right as { start: ExactTemporalValue }).start = structuredClone(command.at);
        (right as { duration: ExactTemporalValue }).duration = subtractExactTemporalValues(item.duration, offset);
        (right as { localStart: ExactTemporalValue }).localStart = addExactTemporalValues(item.localStart, offset);
        (item as { duration: ExactTemporalValue }).duration = offset;
        const index = track.items.indexOf(item);
        track.items.splice(index + 1, 0, right);
        break;
      }
      case "item.replace": {
        const { track, item } = mutableItem(next, command.item.id);
        editable(track);
        track.items.splice(track.items.indexOf(item), 1, structuredClone(command.item));
        break;
      }
      case "item.remove":
        for (const id of new Set(command.ids)) {
          const { track, item } = mutableItem(next, id);
          editable(track);
          track.items = track.items.filter((candidate) => candidate !== item);
        }
        break;
      case "transition.add":
        next.transitions.push(structuredClone(command.transition));
        break;
      case "transition.replace": {
        const index = next.transitions.findIndex((value) => value.id === command.transition.id);
        if (index < 0) throw new Error(`Unknown NLE Transition: ${command.transition.id}`);
        next.transitions.splice(index, 1, structuredClone(command.transition));
        break;
      }
      case "transition.remove": {
        const index = next.transitions.findIndex((value) => value.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Transition: ${command.id}`);
        next.transitions.splice(index, 1);
        break;
      }
      case "matte.add":
        next.mattes.push(structuredClone(command.matte));
        break;
      case "matte.replace": {
        const index = next.mattes.findIndex((value) => value.id === command.matte.id);
        if (index < 0) throw new Error(`Unknown NLE Matte: ${command.matte.id}`);
        next.mattes.splice(index, 1, structuredClone(command.matte));
        break;
      }
      case "matte.remove": {
        const index = next.mattes.findIndex((value) => value.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Matte: ${command.id}`);
        next.mattes.splice(index, 1);
        break;
      }
      case "group.add":
        next.groups.push(structuredClone(command.group));
        break;
      case "group.replace": {
        const index = next.groups.findIndex((value) => value.id === command.group.id);
        if (index < 0) throw new Error(`Unknown NLE Group: ${command.group.id}`);
        next.groups.splice(index, 1, structuredClone(command.group));
        break;
      }
      case "group.remove": {
        const index = next.groups.findIndex((value) => value.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Group: ${command.id}`);
        next.groups.splice(index, 1);
        break;
      }
    }
  }
  next.revision += 1;
  assertNleProject(next);
  return structuredClone(next);
}

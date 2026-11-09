import {
  assertNleProject,
} from "./project.js";
import {
  shiftNleSourceTime,
  sliceNleSourceTime,
} from "./source-time.js";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import type {
  NleCanvas,
  NleComponentValue,
  NleEditRate,
  NleGroup,
  NleItem,
  NleMatte,
  NleMedia,
  NleMediaAssetReference,
  NlePictureLayoutValue,
  NleProject,
  NleSourceTime,
  NleTrack,
  NleTransition,
} from "./types.js";

export type NleCommand =
  | {
      readonly kind: "project.update";
      readonly name?: string;
      readonly editRate?: NleEditRate;
      readonly canvas?: NleCanvas;
    }
  | { readonly kind: "component-value.add"; readonly value: NleComponentValue }
  | { readonly kind: "component-value.replace"; readonly value: NleComponentValue }
  | { readonly kind: "component-value.remove"; readonly id: string }
  | { readonly kind: "picture-layout.add"; readonly value: NlePictureLayoutValue }
  | { readonly kind: "picture-layout.replace"; readonly value: NlePictureLayoutValue }
  | { readonly kind: "picture-layout.remove"; readonly id: string }
  | { readonly kind: "media.add"; readonly media: NleMedia }
  | { readonly kind: "media.rename"; readonly id: string; readonly name: string }
  | { readonly kind: "media.relink"; readonly id: string; readonly asset: NleMediaAssetReference }
  | { readonly kind: "media.replace"; readonly media: NleMedia }
  | { readonly kind: "media.remove"; readonly id: string }
  | { readonly kind: "track.add"; readonly track: NleTrack; readonly before?: string }
  | { readonly kind: "track.move"; readonly id: string; readonly before?: string }
  | {
      readonly kind: "track.update";
      readonly id: string;
      readonly name?: string;
      readonly locked?: boolean;
      readonly muted?: boolean;
    }
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
  | { readonly kind: "item.slip"; readonly id: string; readonly delta: ExactTemporalValue }
  | { readonly kind: "item.retime"; readonly id: string; readonly sourceTime: NleSourceTime }
  | {
      readonly kind: "item.roll";
      readonly left: string;
      readonly right: string;
      readonly at: ExactTemporalValue;
    }
  | {
      readonly kind: "item.ripple-trim";
      readonly id: string;
      readonly edge: "start" | "end";
      readonly at: ExactTemporalValue;
      readonly scope: readonly string[];
    }
  | { readonly kind: "item.split"; readonly id: string; readonly at: ExactTemporalValue; readonly rightId: string }
  | {
      readonly kind: "item.detach-audio";
      readonly id: string;
      readonly audioItemId: string;
      readonly track: string;
      readonly before?: string;
    }
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

type MutableTrack = Omit<NleTrack, "name" | "locked" | "muted" | "items"> & {
  name: string;
  locked: boolean;
  muted: boolean;
  items: NleItem[];
};
type MutableProject = Omit<NleProject,
  "revision" | "name" | "editRate" | "canvas" | "componentValues" | "pictureLayouts" | "media" | "tracks"> & {
  revision: number;
  name: string;
  editRate: NleEditRate;
  canvas: NleCanvas;
  componentValues: NleComponentValue[];
  pictureLayouts: NlePictureLayoutValue[];
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

function editableItems(project: MutableProject, ids: readonly string[]): void {
  const tracks = new Set<MutableTrack>();
  for (const id of ids) tracks.add(mutableItem(project, id).track);
  for (const track of tracks) editable(track);
}

function componentValueUsers(project: MutableProject, id: string): string[] {
  return project.tracks.flatMap((track) => track.items.flatMap((item) =>
    item.kind === "component" && item.bindings?.some((binding) => binding.ref === id) ? [item.id] : []));
}

function pictureLayoutUsers(project: MutableProject, id: string): string[] {
  return project.tracks.flatMap((track) => track.items.flatMap((item) =>
    item.picture !== undefined && Object.hasOwn(item.picture.layout, "ref")
      && (item.picture.layout as { readonly ref: string }).ref === id ? [item.id] : []));
}

function itemEnd(item: NleItem): ExactTemporalValue {
  return addExactTemporalValues(item.start, item.duration);
}

function trimItem(item: NleItem, edge: "start" | "end", at: ExactTemporalValue): void {
  const oldDuration = structuredClone(item.duration);
  if (edge === "start") {
    const delta = subtractExactTemporalValues(at, item.start);
    const duration = subtractExactTemporalValues(oldDuration, delta);
    const sourceTime = sliceNleSourceTime(item.sourceTime, oldDuration, {
      start: delta,
      end: oldDuration,
    });
    (item as { start: ExactTemporalValue }).start = structuredClone(at);
    (item as { duration: ExactTemporalValue }).duration = duration;
    (item as { sourceTime: NleSourceTime }).sourceTime = sourceTime;
  } else {
    const duration = subtractExactTemporalValues(at, item.start);
    const sourceTime = sliceNleSourceTime(item.sourceTime, oldDuration, {
      start: exactTemporalZero(),
      end: duration,
    });
    (item as { duration: ExactTemporalValue }).duration = duration;
    (item as { sourceTime: NleSourceTime }).sourceTime = sourceTime;
  }
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
      case "project.update":
        if (command.name !== undefined) next.name = command.name;
        if (command.editRate !== undefined) next.editRate = structuredClone(command.editRate);
        if (command.canvas !== undefined) next.canvas = structuredClone(command.canvas);
        break;
      case "component-value.add":
        next.componentValues.push(structuredClone(command.value));
        break;
      case "component-value.replace": {
        const index = next.componentValues.findIndex((candidate) => candidate.id === command.value.id);
        if (index < 0) throw new Error(`Unknown NLE Component Value: ${command.value.id}`);
        editableItems(next, componentValueUsers(next, command.value.id));
        next.componentValues.splice(index, 1, structuredClone(command.value));
        break;
      }
      case "component-value.remove": {
        const index = next.componentValues.findIndex((candidate) => candidate.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Component Value: ${command.id}`);
        const users = componentValueUsers(next, command.id);
        if (users.length > 0) {
          throw new Error(`NLE Component Value ${command.id} is still used by Items: ${users.join(", ")}.`);
        }
        next.componentValues.splice(index, 1);
        break;
      }
      case "picture-layout.add":
        next.pictureLayouts.push(structuredClone(command.value));
        break;
      case "picture-layout.replace": {
        const index = next.pictureLayouts.findIndex((candidate) => candidate.id === command.value.id);
        if (index < 0) throw new Error(`Unknown NLE Picture Layout: ${command.value.id}`);
        editableItems(next, pictureLayoutUsers(next, command.value.id));
        next.pictureLayouts.splice(index, 1, structuredClone(command.value));
        break;
      }
      case "picture-layout.remove": {
        const index = next.pictureLayouts.findIndex((candidate) => candidate.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Picture Layout: ${command.id}`);
        const users = pictureLayoutUsers(next, command.id);
        if (users.length > 0) {
          throw new Error(`NLE Picture Layout ${command.id} is still used by Items: ${users.join(", ")}.`);
        }
        next.pictureLayouts.splice(index, 1);
        break;
      }
      case "media.add":
        next.media.push(structuredClone(command.media));
        break;
      case "media.rename": {
        const index = next.media.findIndex((candidate) => candidate.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Media: ${command.id}`);
        next.media.splice(index, 1, { ...next.media[index]!, name: command.name });
        break;
      }
      case "media.relink": {
        const index = next.media.findIndex((candidate) => candidate.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Media: ${command.id}`);
        next.media.splice(index, 1, { ...next.media[index]!, asset: structuredClone(command.asset) });
        break;
      }
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
      case "track.update": {
        const track = mutableTrack(next, command.id);
        if (command.name !== undefined) track.name = command.name;
        if (command.locked !== undefined) track.locked = command.locked;
        if (command.muted !== undefined) track.muted = command.muted;
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
        trimItem(item, command.edge, command.at);
        break;
      }
      case "item.slip": {
        const { track, item } = mutableItem(next, command.id);
        editable(track);
        assertExactTemporalValue(command.delta, "NLE Item slip delta");
        (item as { sourceTime: NleSourceTime }).sourceTime = shiftNleSourceTime(
          item.sourceTime,
          item.duration,
          command.delta,
        );
        break;
      }
      case "item.retime": {
        const { track, item } = mutableItem(next, command.id);
        editable(track);
        (item as { sourceTime: NleSourceTime }).sourceTime = structuredClone(command.sourceTime);
        break;
      }
      case "item.roll": {
        if (command.left === command.right) throw new Error("NLE roll Items must be distinct.");
        assertExactTemporalValue(command.at, "NLE roll boundary");
        const left = mutableItem(next, command.left);
        const right = mutableItem(next, command.right);
        editableItems(next, [command.left, command.right]);
        if (left.track.id !== right.track.id) {
          throw new Error("NLE roll Items must belong to the same Track.");
        }
        const previousBoundary = itemEnd(left.item);
        if (compareExactTemporalValues(previousBoundary, right.item.start) !== 0) {
          throw new Error("NLE roll Items must share one Programme boundary.");
        }
        const rightEnd = itemEnd(right.item);
        if (compareExactTemporalValues(command.at, left.item.start) <= 0
          || compareExactTemporalValues(command.at, rightEnd) >= 0) {
          throw new Error("NLE roll boundary must remain inside both outer Item edges.");
        }
        const delta = subtractExactTemporalValues(command.at, previousBoundary);
        const leftDuration = subtractExactTemporalValues(
          command.at,
          left.item.start,
        );
        const rightDuration = subtractExactTemporalValues(rightEnd, command.at);
        const leftSourceTime = sliceNleSourceTime(left.item.sourceTime, left.item.duration, {
          start: exactTemporalZero(),
          end: leftDuration,
        });
        const rightSourceTime = sliceNleSourceTime(right.item.sourceTime, right.item.duration, {
          start: delta,
          end: right.item.duration,
        });
        (left.item as { duration: ExactTemporalValue }).duration = leftDuration;
        (left.item as { sourceTime: NleSourceTime }).sourceTime = leftSourceTime;
        (right.item as { start: ExactTemporalValue }).start = structuredClone(command.at);
        (right.item as { duration: ExactTemporalValue }).duration = rightDuration;
        (right.item as { sourceTime: NleSourceTime }).sourceTime = rightSourceTime;
        break;
      }
      case "item.ripple-trim": {
        assertExactTemporalValue(command.at, "NLE ripple-trim position");
        const scope = new Set<string>();
        for (const id of command.scope) {
          if (id === command.id) throw new Error("NLE ripple-trim scope cannot contain its target Item.");
          if (scope.has(id)) throw new Error(`NLE ripple-trim scope repeats Item ${id}.`);
          scope.add(id);
        }
        editableItems(next, [command.id, ...scope]);
        const target = mutableItem(next, command.id).item;
        const before = command.edge === "start" ? target.start : itemEnd(target);
        trimItem(target, command.edge, command.at);
        const after = command.edge === "start" ? target.start : itemEnd(target);
        const delta = subtractExactTemporalValues(after, before);
        for (const id of scope) {
          const item = mutableItem(next, id).item;
          (item as { start: ExactTemporalValue }).start = addExactTemporalValues(item.start, delta);
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
        const oldDuration = structuredClone(item.duration);
        (right as { id: string }).id = command.rightId;
        (right as { start: ExactTemporalValue }).start = structuredClone(command.at);
        (right as { duration: ExactTemporalValue }).duration = subtractExactTemporalValues(oldDuration, offset);
        (right as { sourceTime: NleSourceTime }).sourceTime = sliceNleSourceTime(
          item.sourceTime,
          oldDuration,
          { start: offset, end: oldDuration },
        );
        (item as { sourceTime: NleSourceTime }).sourceTime = sliceNleSourceTime(
          item.sourceTime,
          oldDuration,
          { start: exactTemporalZero(), end: offset },
        );
        (item as { duration: ExactTemporalValue }).duration = offset;
        const index = track.items.indexOf(item);
        track.items.splice(index + 1, 0, right);
        break;
      }
      case "item.detach-audio": {
        const { track, item } = mutableItem(next, command.id);
        const destination = mutableTrack(next, command.track);
        editable(track);
        editable(destination);
        if (track.kind !== "picture") throw new Error(`NLE Item ${item.id} is not on a Picture Track.`);
        if (destination.kind !== "audio") throw new Error(`NLE Track ${destination.id} is not an Audio Track.`);
        if (item.picture === undefined || item.audio === undefined) {
          throw new Error(`NLE Item ${item.id} does not have attached Picture and Audio.`);
        }
        const { audio, ...pictureItem } = item;
        const { picture: _picture, ...audioItem } = item;
        track.items.splice(track.items.indexOf(item), 1, pictureItem as NleItem);
        destination.items = insert(destination.items, {
          ...audioItem,
          id: command.audioItemId,
          audio,
        } as NleItem, command.before);
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
        editableItems(next, [command.transition.outgoing, command.transition.incoming]);
        next.transitions.push(structuredClone(command.transition));
        break;
      case "transition.replace": {
        const index = next.transitions.findIndex((value) => value.id === command.transition.id);
        if (index < 0) throw new Error(`Unknown NLE Transition: ${command.transition.id}`);
        const current = next.transitions[index]!;
        editableItems(next, [
          current.outgoing, current.incoming,
          command.transition.outgoing, command.transition.incoming,
        ]);
        next.transitions.splice(index, 1, structuredClone(command.transition));
        break;
      }
      case "transition.remove": {
        const index = next.transitions.findIndex((value) => value.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Transition: ${command.id}`);
        const current = next.transitions[index]!;
        editableItems(next, [current.outgoing, current.incoming]);
        next.transitions.splice(index, 1);
        break;
      }
      case "matte.add":
        editableItems(next, [command.matte.content, command.matte.matte]);
        next.mattes.push(structuredClone(command.matte));
        break;
      case "matte.replace": {
        const index = next.mattes.findIndex((value) => value.id === command.matte.id);
        if (index < 0) throw new Error(`Unknown NLE Matte: ${command.matte.id}`);
        const current = next.mattes[index]!;
        editableItems(next, [current.content, current.matte, command.matte.content, command.matte.matte]);
        next.mattes.splice(index, 1, structuredClone(command.matte));
        break;
      }
      case "matte.remove": {
        const index = next.mattes.findIndex((value) => value.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Matte: ${command.id}`);
        const current = next.mattes[index]!;
        editableItems(next, [current.content, current.matte]);
        next.mattes.splice(index, 1);
        break;
      }
      case "group.add":
        editableItems(next, command.group.items);
        next.groups.push(structuredClone(command.group));
        break;
      case "group.replace": {
        const index = next.groups.findIndex((value) => value.id === command.group.id);
        if (index < 0) throw new Error(`Unknown NLE Group: ${command.group.id}`);
        editableItems(next, [...next.groups[index]!.items, ...command.group.items]);
        next.groups.splice(index, 1, structuredClone(command.group));
        break;
      }
      case "group.remove": {
        const index = next.groups.findIndex((value) => value.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Group: ${command.id}`);
        editableItems(next, next.groups[index]!.items);
        next.groups.splice(index, 1);
        break;
      }
    }
  }
  next.revision += 1;
  assertNleProject(next);
  return structuredClone(next);
}

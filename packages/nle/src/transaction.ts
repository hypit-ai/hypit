import {
  addExactTemporalValues,
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import { assertNleProject } from "./project.js";
import { shiftNleTimeMapping, sliceNleTimeMapping } from "./source-time.js";
import type {
  NleCanvas,
  NleComponentItem,
  NleComponentSharedValueBinding,
  NleComposition,
  NleItem,
  NleMatte,
  NleProcess,
  NlePresentItem,
  NleProject,
  NleSharedValue,
  NleTimeMapping,
  NleTrack,
  NleTransition,
} from "./types.js";

export type NleCommand =
  | { readonly kind: "project.update"; readonly name?: string; readonly rootComposition?: string }
  | { readonly kind: "shared-value.add"; readonly value: NleSharedValue; readonly before?: string }
  | { readonly kind: "shared-value.replace"; readonly value: NleSharedValue }
  | { readonly kind: "shared-value.remove"; readonly id: string }
  | {
      readonly kind: "component-shared-value-binding.set";
      readonly item: string;
      readonly binding: NleComponentSharedValueBinding;
    }
  | { readonly kind: "component-shared-value-binding.remove"; readonly item: string; readonly slot: string }
  | { readonly kind: "composition.add"; readonly composition: NleComposition; readonly before?: string }
  | {
      readonly kind: "composition.update";
      readonly id: string;
      readonly name?: string;
      readonly canvas?: NleCanvas;
    }
  | { readonly kind: "composition.remove"; readonly id: string }
  | { readonly kind: "track.add"; readonly composition: string; readonly track: NleTrack; readonly before?: string }
  | { readonly kind: "track.move"; readonly id: string; readonly before?: string }
  | {
      readonly kind: "track.update";
      readonly id: string;
      readonly name?: string;
      readonly enabled?: boolean;
    }
  | { readonly kind: "track.remove"; readonly id: string }
  | { readonly kind: "item.add"; readonly track: string; readonly item: NleItem; readonly before?: string }
  | {
      readonly kind: "item.update";
      readonly id: string;
      readonly name?: string | null;
      readonly enabled?: boolean;
    }
  | {
      readonly kind: "item.move";
      readonly ids: readonly string[];
      readonly delta: ExactTemporalValue;
      readonly destinations?: readonly { readonly item: string; readonly track: string }[];
    }
  | {
      readonly kind: "item.trim";
      readonly id: string;
      readonly edge: "start" | "end";
      readonly at: ExactTemporalValue;
    }
  | { readonly kind: "item.slip"; readonly id: string; readonly delta: ExactTemporalValue }
  | { readonly kind: "item.retime"; readonly id: string; readonly time: NleTimeMapping }
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
      /** Exact Items displaced by this edit; ripple never infers a hidden global scope. */
      readonly scope: readonly string[];
    }
  | {
      readonly kind: "item.split";
      readonly id: string;
      readonly at: ExactTemporalValue;
      readonly rightId: string;
    }
  | {
      readonly kind: "item.detach-audio";
      readonly id: string;
      readonly audioItemId: string;
      readonly track: string;
      readonly before?: string;
    }
  | {
      readonly kind: "process.add";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly process: NleProcess;
      readonly before?: string;
    }
  | {
      readonly kind: "process.move";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly id: string;
      readonly before?: string;
    }
  | {
      readonly kind: "process.replace";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly process: NleProcess;
    }
  | {
      readonly kind: "process.retime";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly id: string;
      readonly controlTime: NleTimeMapping;
    }
  | {
      readonly kind: "process.remove";
      readonly item: string;
      readonly medium: "picture" | "audio";
      readonly id: string;
    }
  | { readonly kind: "transition.add"; readonly composition: string; readonly transition: NleTransition }
  | { readonly kind: "transition.replace"; readonly transition: NleTransition }
  | { readonly kind: "transition.remove"; readonly id: string }
  | { readonly kind: "matte.add"; readonly composition: string; readonly matte: NleMatte }
  | { readonly kind: "matte.replace"; readonly matte: NleMatte }
  | { readonly kind: "matte.remove"; readonly id: string }
  | { readonly kind: "item.replace"; readonly item: NleItem }
  | { readonly kind: "item.remove"; readonly ids: readonly string[] };

export type NleTransaction = {
  readonly commands: readonly NleCommand[];
};

type MutableItem = NleItem & {
  name?: string;
  start: ExactTemporalValue;
  duration: ExactTemporalValue;
  enabled: boolean;
};

type MutableTrack = Omit<NleTrack, "name" | "enabled" | "items"> & {
  name: string;
  enabled: boolean;
  items: MutableItem[];
};

type MutableComposition = Omit<NleComposition, "canvas" | "tracks" | "transitions" | "mattes"> & {
  canvas: NleCanvas;
  tracks: MutableTrack[];
  transitions: NleTransition[];
  mattes: NleMatte[];
};

type MutableProject = Omit<NleProject,
  "name" | "rootComposition" | "sharedValues" | "compositions"> & {
  name: string;
  rootComposition: string;
  sharedValues: NleSharedValue[];
  compositions: MutableComposition[];
};

function mutableComposition(project: MutableProject, id: string): MutableComposition {
  const composition = project.compositions.find((candidate) => candidate.id === id);
  if (composition === undefined) throw new Error(`Unknown NLE Composition: ${id}.`);
  return composition;
}

function mutableTrackLocation(project: MutableProject, id: string): {
  composition: MutableComposition;
  track: MutableTrack;
} {
  for (const composition of project.compositions) {
    const track = composition.tracks.find((candidate) => candidate.id === id);
    if (track !== undefined) return { composition, track };
  }
  throw new Error(`Unknown NLE Track: ${id}.`);
}

function mutableTrack(project: MutableProject, id: string): MutableTrack {
  return mutableTrackLocation(project, id).track;
}

function mutableItem(project: MutableProject, id: string): {
  composition: MutableComposition;
  track: MutableTrack;
  item: MutableItem;
} {
  for (const composition of project.compositions) {
    for (const track of composition.tracks) {
      const item = track.items.find((candidate) => candidate.id === id);
      if (item !== undefined) return { composition, track, item };
    }
  }
  throw new Error(`Unknown NLE Item: ${id}.`);
}

function mutableComponentItem(project: MutableProject, id: string): NleComponentItem & {
  sharedValueBindings?: NleComponentSharedValueBinding[];
} {
  const item = mutableItem(project, id).item;
  if (item.kind !== "present" || item.source !== "component") {
    throw new Error(`NLE Item ${id} is not a Component Present.`);
  }
  return item as NleComponentItem & { sharedValueBindings?: NleComponentSharedValueBinding[] };
}

function insert<T extends { readonly id: string }>(values: readonly T[], value: T, before?: string): T[] {
  const next = [...values];
  const index = before === undefined ? next.length : next.findIndex((candidate) => candidate.id === before);
  if (index < 0) throw new Error(`Unknown insertion target: ${before}.`);
  next.splice(index, 0, value);
  return next;
}

function itemTime(item: NleItem): NleTimeMapping {
  return item.kind === "present" ? item.sourceTime : item.controlTime;
}

function setItemTime(item: MutableItem, time: NleTimeMapping): void {
  if (item.kind === "present") (item as { sourceTime: NleTimeMapping }).sourceTime = time;
  else (item as { controlTime: NleTimeMapping }).controlTime = time;
}

function mutableProcesses(
  project: MutableProject,
  itemId: string,
  medium: "picture" | "audio",
): NleProcess[] {
  const { item } = mutableItem(project, itemId);
  if (item.kind !== "present") throw new Error(`NLE Item ${itemId} is not a Present.`);
  const appearance = medium === "picture" ? item.picture : item.audio;
  if (appearance === undefined) throw new Error(`NLE Present Item ${itemId} has no ${medium} appearance.`);
  const mutable = appearance as { processes?: NleProcess[] };
  mutable.processes ??= [];
  return mutable.processes;
}

function sliceOccurrenceOperators(
  item: MutableItem,
  oldDuration: ExactTemporalValue,
  range: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue },
): void {
  if (item.kind !== "present") return;
  for (const process of [...(item.picture?.processes ?? []), ...(item.audio?.processes ?? [])]) {
    (process as { controlTime: NleTimeMapping }).controlTime = sliceNleTimeMapping(
      process.controlTime,
      oldDuration,
      range,
    );
  }
}

function sliceItemTime(
  item: MutableItem,
  oldDuration: ExactTemporalValue,
  range: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue },
): void {
  setItemTime(item, sliceNleTimeMapping(itemTime(item), oldDuration, range));
  sliceOccurrenceOperators(item, oldDuration, range);
}

function trimItem(item: MutableItem, edge: "start" | "end", at: ExactTemporalValue): void {
  const oldDuration = structuredClone(item.duration);
  if (edge === "start") {
    const offset = subtractExactTemporalValues(at, item.start);
    sliceItemTime(item, oldDuration, { start: offset, end: oldDuration });
    item.start = structuredClone(at);
    item.duration = subtractExactTemporalValues(oldDuration, offset);
    return;
  }
  const duration = subtractExactTemporalValues(at, item.start);
  sliceItemTime(item, oldDuration, {
    start: exactTemporalZero(),
    end: duration,
  });
  item.duration = duration;
}

function itemEnd(item: NleItem): ExactTemporalValue {
  return addExactTemporalValues(item.start, item.duration);
}

/** Pure Project transformation. Open-session concurrency belongs to NleProjectService. */
export function applyNleTransaction(project: NleProject, transaction: NleTransaction): NleProject {
  assertNleProject(project);
  if (!Array.isArray(transaction.commands) || transaction.commands.length === 0) {
    throw new Error("NLE Transaction must contain at least one command.");
  }
  const next = structuredClone(project) as MutableProject;
  for (const command of transaction.commands) {
    switch (command.kind) {
      case "project.update":
        if (command.name !== undefined) next.name = command.name;
        if (command.rootComposition !== undefined) next.rootComposition = command.rootComposition;
        break;
      case "shared-value.add":
        next.sharedValues = insert(next.sharedValues, structuredClone(command.value), command.before);
        break;
      case "shared-value.replace": {
        const index = next.sharedValues.findIndex((value) => value.id === command.value.id);
        if (index < 0) throw new Error(`Unknown NLE Shared Value: ${command.value.id}.`);
        next.sharedValues.splice(index, 1, structuredClone(command.value));
        break;
      }
      case "shared-value.remove": {
        const index = next.sharedValues.findIndex((value) => value.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Shared Value: ${command.id}.`);
        next.sharedValues.splice(index, 1);
        break;
      }
      case "component-shared-value-binding.set": {
        const item = mutableComponentItem(next, command.item);
        const bindings = [...(item.sharedValueBindings ?? [])];
        const index = bindings.findIndex((binding) => binding.slot === command.binding.slot);
        if (index < 0) bindings.push(structuredClone(command.binding));
        else bindings.splice(index, 1, structuredClone(command.binding));
        item.sharedValueBindings = bindings;
        break;
      }
      case "component-shared-value-binding.remove": {
        const item = mutableComponentItem(next, command.item);
        const bindings = [...(item.sharedValueBindings ?? [])];
        const index = bindings.findIndex((binding) => binding.slot === command.slot);
        if (index < 0) throw new Error(`NLE Item ${command.item} has no shared-value slot ${command.slot}.`);
        bindings.splice(index, 1);
        if (bindings.length === 0) delete item.sharedValueBindings;
        else item.sharedValueBindings = bindings;
        break;
      }
      case "composition.add":
        next.compositions = insert(next.compositions, structuredClone(command.composition) as MutableComposition,
          command.before);
        break;
      case "composition.update": {
        const composition = mutableComposition(next, command.id);
        if (command.name !== undefined) (composition as { name: string }).name = command.name;
        if (command.canvas !== undefined) composition.canvas = structuredClone(command.canvas);
        break;
      }
      case "composition.remove": {
        if (command.id === next.rootComposition) {
          throw new Error(`Cannot remove root NLE Composition ${command.id}.`);
        }
        const composition = mutableComposition(next, command.id);
        next.compositions.splice(next.compositions.indexOf(composition), 1);
        break;
      }
      case "track.add":
        mutableComposition(next, command.composition).tracks = insert(
          mutableComposition(next, command.composition).tracks,
          structuredClone(command.track) as MutableTrack,
          command.before,
        );
        break;
      case "track.move": {
        const { composition, track } = mutableTrackLocation(next, command.id);
        const remaining = composition.tracks.filter((candidate) => candidate.id !== command.id);
        composition.tracks = insert(remaining, track, command.before);
        break;
      }
      case "track.update": {
        const track = mutableTrack(next, command.id);
        if (command.name !== undefined) track.name = command.name;
        if (command.enabled !== undefined) track.enabled = command.enabled;
        break;
      }
      case "track.remove": {
        const { composition, track } = mutableTrackLocation(next, command.id);
        if (track.items.length > 0) throw new Error(`NLE Track ${track.id} still contains Items.`);
        composition.tracks.splice(composition.tracks.indexOf(track), 1);
        break;
      }
      case "item.add": {
        const track = mutableTrack(next, command.track);
        track.items = insert(track.items, structuredClone(command.item) as MutableItem, command.before);
        break;
      }
      case "item.update": {
        const { item } = mutableItem(next, command.id);
        if (command.name === null) delete item.name;
        else if (command.name !== undefined) item.name = command.name;
        if (command.enabled !== undefined) item.enabled = command.enabled;
        break;
      }
      case "item.move": {
        assertExactTemporalValue(command.delta, "NLE Item move delta");
        const ids = [...new Set<string>(command.ids)];
        if (ids.length === 0) throw new Error("NLE Item move requires at least one Item.");
        const selected = new Set(ids);
        const destinations = new Map<string, MutableTrack>();
        for (const destination of command.destinations ?? []) {
          if (!selected.has(destination.item)) {
            throw new Error(`NLE Item move destination references unselected Item ${destination.item}.`);
          }
          if (destinations.has(destination.item)) {
            throw new Error(`NLE Item move repeats destination for Item ${destination.item}.`);
          }
          destinations.set(destination.item, mutableTrack(next, destination.track));
        }
        for (const id of ids) {
          const { track, item } = mutableItem(next, id);
          item.start = addExactTemporalValues(item.start, command.delta);
          const destination = destinations.get(id);
          if (destination !== undefined && destination.id !== track.id) {
            track.items = track.items.filter((candidate) => candidate.id !== id);
            destination.items.push(item);
          }
        }
        break;
      }
      case "item.trim": {
        assertExactTemporalValue(command.at, "NLE Item trim position");
        trimItem(mutableItem(next, command.id).item, command.edge, command.at);
        break;
      }
      case "item.slip": {
        assertExactTemporalValue(command.delta, "NLE Item slip delta");
        const item = mutableItem(next, command.id).item;
        setItemTime(item, shiftNleTimeMapping(itemTime(item), item.duration, command.delta));
        break;
      }
      case "item.retime":
        setItemTime(mutableItem(next, command.id).item, structuredClone(command.time));
        break;
      case "item.roll": {
        if (command.left === command.right) throw new Error("NLE roll Items must be distinct.");
        assertExactTemporalValue(command.at, "NLE roll boundary");
        const left = mutableItem(next, command.left);
        const right = mutableItem(next, command.right);
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
        const leftDuration = subtractExactTemporalValues(command.at, left.item.start);
        const rightDuration = subtractExactTemporalValues(rightEnd, command.at);
        const leftOldDuration = structuredClone(left.item.duration);
        const rightOldDuration = structuredClone(right.item.duration);
        const delta = subtractExactTemporalValues(command.at, previousBoundary);
        sliceItemTime(left.item, leftOldDuration, {
          start: exactTemporalZero(),
          end: leftDuration,
        });
        sliceItemTime(right.item, rightOldDuration, {
          start: delta,
          end: rightOldDuration,
        });
        left.item.duration = leftDuration;
        right.item.start = structuredClone(command.at);
        right.item.duration = rightDuration;
        break;
      }
      case "item.ripple-trim": {
        assertExactTemporalValue(command.at, "NLE ripple-trim position");
        const scope = new Set<string>();
        for (const id of command.scope) {
          if (id === command.id) throw new Error("NLE ripple-trim scope cannot contain its target Item.");
          if (scope.has(id)) throw new Error(`NLE ripple-trim scope repeats Item ${id}.`);
          mutableItem(next, id);
          scope.add(id);
        }
        const target = mutableItem(next, command.id).item;
        const before = command.edge === "start" ? target.start : itemEnd(target);
        trimItem(target, command.edge, command.at);
        const after = command.edge === "start" ? target.start : itemEnd(target);
        const delta = subtractExactTemporalValues(after, before);
        for (const id of scope) {
          const item = mutableItem(next, id).item;
          item.start = addExactTemporalValues(item.start, delta);
        }
        break;
      }
      case "item.split": {
        assertExactTemporalValue(command.at, "NLE Item split position");
        const { track, item } = mutableItem(next, command.id);
        const offset = subtractExactTemporalValues(command.at, item.start);
        const oldDuration = structuredClone(item.duration);
        if (compareExactTemporalValues(offset, exactTemporalZero()) <= 0
          || compareExactTemporalValues(offset, oldDuration) >= 0) {
          throw new Error("NLE split must lie inside the Item.");
        }
        const right = structuredClone(item) as MutableItem;
        (right as { id: string }).id = command.rightId;
        right.start = structuredClone(command.at);
        right.duration = subtractExactTemporalValues(oldDuration, offset);
        sliceItemTime(right, oldDuration, {
          start: offset,
          end: oldDuration,
        });
        item.duration = offset;
        sliceItemTime(item, oldDuration, {
          start: exactTemporalZero(),
          end: offset,
        });
        track.items.splice(track.items.indexOf(item) + 1, 0, right);
        break;
      }
      case "item.detach-audio": {
        const { track, item } = mutableItem(next, command.id);
        const destination = mutableTrack(next, command.track);
        if (item.kind !== "present") throw new Error(`NLE Item ${item.id} is not a Present.`);
        if (track.kind !== "picture") throw new Error(`NLE Item ${item.id} is not on a Picture Track.`);
        if (destination.kind !== "audio") throw new Error(`NLE Track ${destination.id} is not an Audio Track.`);
        if (item.picture === undefined || item.audio === undefined) {
          throw new Error(`NLE Item ${item.id} does not have attached Picture and Audio.`);
        }
        const pictureItem = structuredClone(item) as MutableItem;
        delete (pictureItem as { audio?: NlePresentItem["audio"] }).audio;
        const audioItem = structuredClone(item) as MutableItem;
        (audioItem as { id: string }).id = command.audioItemId;
        delete (audioItem as { picture?: NlePresentItem["picture"] }).picture;
        track.items.splice(track.items.indexOf(item), 1, pictureItem);
        destination.items = insert(destination.items, audioItem, command.before);
        break;
      }
      case "process.add": {
        const processes = mutableProcesses(next, command.item, command.medium);
        const added = insert(processes, structuredClone(command.process), command.before);
        processes.splice(0, processes.length, ...added);
        break;
      }
      case "process.move": {
        const processes = mutableProcesses(next, command.item, command.medium);
        const process = processes.find((candidate) => candidate.id === command.id);
        if (process === undefined) throw new Error(`Unknown NLE Process: ${command.id}.`);
        const moved = insert(
          processes.filter((candidate) => candidate.id !== command.id),
          process,
          command.before,
        );
        processes.splice(0, processes.length, ...moved);
        break;
      }
      case "process.replace": {
        const processes = mutableProcesses(next, command.item, command.medium);
        const index = processes.findIndex((candidate) => candidate.id === command.process.id);
        if (index < 0) throw new Error(`Unknown NLE Process: ${command.process.id}.`);
        processes.splice(index, 1, structuredClone(command.process));
        break;
      }
      case "process.retime": {
        const processes = mutableProcesses(next, command.item, command.medium);
        const process = processes.find((candidate) => candidate.id === command.id);
        if (process === undefined) throw new Error(`Unknown NLE Process: ${command.id}.`);
        (process as { controlTime: NleTimeMapping }).controlTime = structuredClone(command.controlTime);
        break;
      }
      case "process.remove": {
        const processes = mutableProcesses(next, command.item, command.medium);
        const index = processes.findIndex((candidate) => candidate.id === command.id);
        if (index < 0) throw new Error(`Unknown NLE Process: ${command.id}.`);
        processes.splice(index, 1);
        break;
      }
      case "transition.add":
        mutableComposition(next, command.composition).transitions.push(structuredClone(command.transition));
        break;
      case "transition.replace": {
        const composition = next.compositions.find((candidate) =>
          candidate.transitions.some((value) => value.id === command.transition.id));
        if (composition === undefined) throw new Error(`Unknown NLE Transition: ${command.transition.id}.`);
        const index = composition.transitions.findIndex((value) => value.id === command.transition.id);
        composition.transitions.splice(index, 1, structuredClone(command.transition));
        break;
      }
      case "transition.remove": {
        const composition = next.compositions.find((candidate) =>
          candidate.transitions.some((value) => value.id === command.id));
        if (composition === undefined) throw new Error(`Unknown NLE Transition: ${command.id}.`);
        const index = composition.transitions.findIndex((value) => value.id === command.id);
        composition.transitions.splice(index, 1);
        break;
      }
      case "matte.add":
        mutableComposition(next, command.composition).mattes.push(structuredClone(command.matte));
        break;
      case "matte.replace": {
        const composition = next.compositions.find((candidate) =>
          candidate.mattes.some((value) => value.id === command.matte.id));
        if (composition === undefined) throw new Error(`Unknown NLE Matte: ${command.matte.id}.`);
        const index = composition.mattes.findIndex((value) => value.id === command.matte.id);
        composition.mattes.splice(index, 1, structuredClone(command.matte));
        break;
      }
      case "matte.remove": {
        const composition = next.compositions.find((candidate) =>
          candidate.mattes.some((value) => value.id === command.id));
        if (composition === undefined) throw new Error(`Unknown NLE Matte: ${command.id}.`);
        const index = composition.mattes.findIndex((value) => value.id === command.id);
        composition.mattes.splice(index, 1);
        break;
      }
      case "item.replace": {
        const { track, item } = mutableItem(next, command.item.id);
        track.items.splice(track.items.indexOf(item), 1, structuredClone(command.item) as MutableItem);
        break;
      }
      case "item.remove": {
        const ids = [...new Set<string>(command.ids)];
        if (ids.length === 0) throw new Error("NLE Item remove requires at least one Item.");
        for (const id of ids) {
          const { track, item } = mutableItem(next, id);
          track.items.splice(track.items.indexOf(item), 1);
        }
        break;
      }
      default:
        throw new Error(`Unknown NLE command: ${String((command as { readonly kind?: unknown }).kind)}.`);
    }
  }
  assertNleProject(next);
  return structuredClone(next);
}

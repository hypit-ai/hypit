import { randomUUID } from "node:crypto";
import { applyNleTransaction, nleItemEnd, type NleCommand, type NleComposition, type NleItem, type NleProject, type NleTrack } from "@hypit/nle";
import { nleViewCompositionState, nleViewTrackLocked, type NleView } from "@hypit/nle/view";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalRate,
} from "@hypit/temporal/algebra";
import type { NleStudioTimelineDrop, NleStudioTimelineEdit } from "./protocol.js";

export function studioFrameTime(frame: number, rate: TemporalRate): ExactTemporalValue {
  if (!Number.isSafeInteger(frame)) throw new Error("NLE Studio frame must be a safe integer.");
  return { ticks: String(BigInt(frame) * BigInt(rate.denominator)), timeBase: { numerator: 1, denominator: rate.numerator } };
}

function relatedItems(composition: NleComposition, view: NleView, seeds: readonly string[]): Set<string> {
  const relations = [
    ...(nleViewCompositionState(view, composition.id)?.groups.map(group => group.items) ?? []),
    ...composition.transitions.map(transition => [transition.outgoing, transition.incoming]),
    ...composition.mattes.map(matte => [matte.content, matte.matte]),
  ];
  const selected = new Set(seeds);
  let previousSize: number;
  do {
    previousSize = selected.size;
    for (const members of relations) {
      if (members.some(item => selected.has(item))) for (const item of members) selected.add(item);
    }
  } while (selected.size !== previousSize);
  return selected;
}

function pictureCollision(item: NleItem, other: NleItem, delta: ExactTemporalValue): boolean {
  return item.kind === "present" && other.kind === "present"
    && compareExactTemporalValues(addExactTemporalValues(item.start, delta), nleItemEnd(other)) < 0
    && compareExactTemporalValues(other.start, addExactTemporalValues(nleItemEnd(item), delta)) < 0;
}

type ActiveTimeline = { readonly project: NleProject; readonly composition: NleComposition; readonly view: NleView };

function timelineScope(composition: NleComposition, tracks: readonly string[]) {
  const ids = new Set(tracks);
  const selected = composition.tracks.filter(track => ids.has(track.id));
  if (selected.length === 0 || selected.length !== tracks.length) {
    throw new Error(`NLE Studio scoped edit requires distinct Tracks in Composition ${composition.id}.`);
  }
  return selected;
}

function scopedTail(
  { composition, view }: ActiveTimeline,
  tracks: readonly NleTrack[],
  start: ExactTemporalValue,
  boundary: ExactTemporalValue,
  excluded: ReadonlySet<string>,
) {
  const candidates = tracks.flatMap(track => track.items).filter(item => !excluded.has(item.id));
  if (candidates.some(item => compareExactTemporalValues(item.start, boundary) < 0
      && compareExactTemporalValues(start, nleItemEnd(item)) < 0)) {
    throw new Error("NLE Studio scoped edit crosses an Item on the selected Tracks.");
  }
  const next = candidates.filter(item => compareExactTemporalValues(item.start, boundary) >= 0).map(item => item.id);
  const moving = new Set(next);
  for (const linked of relatedItems(composition, view, next)) {
    if (!moving.has(linked) && !excluded.has(linked)) {
      throw new Error(`NLE Studio scoped edit cannot move linked Item ${linked} within the chosen range and Tracks.`);
    }
  }
  return next;
}

export function planTimelineInsertion(
  context: ActiveTimeline,
  destination: string,
  tracks: readonly string[],
  at: ExactTemporalValue,
  duration: ExactTemporalValue,
) {
  if (!tracks.includes(destination)) throw new Error("NLE Studio insert scope must include its destination Track.");
  const scope = timelineScope(context.composition, tracks);
  const ids = scopedTail(context, scope, at, at, new Set());
  const commands: readonly NleCommand[] = ids.length === 0 ? [] : [{ kind: "item.move", ids, delta: duration }];
  return commands;
}

export function planTimelineEdit(context: ActiveTimeline, edit: NleStudioTimelineEdit) {
  const { composition, view } = context;
  const entries = composition.tracks.flatMap(track => track.items.map(item => ({ track, item })));
  const selection = (ids: readonly string[]) => {
    const selected = new Set(ids);
    const found = entries.filter(({ item }) => selected.has(item.id));
    if (found.length === 0 || found.length !== selected.size) {
      throw new Error(`NLE Studio edit requires existing Items in Composition ${composition.id}.`);
    }
    return found;
  };
  const time = (frame: number) => studioFrameTime(frame, view.editRate);
  const compare = compareExactTemporalValues;
  const commands: NleCommand[] = [];
  let count = 0;
  const remove = (ids: ReadonlySet<string>) => {
    for (const relation of composition.transitions) {
      if (ids.has(relation.outgoing) || ids.has(relation.incoming)) {
        commands.push({ kind: "transition.remove", id: relation.id });
      }
    }
    for (const relation of composition.mattes) {
      if (ids.has(relation.content) || ids.has(relation.matte)) commands.push({ kind: "matte.remove", id: relation.id });
    }
    commands.push({ kind: "item.remove", ids: [...ids] });
    count = ids.size;
  };
  const close = (tracks: readonly NleTrack[], start: ExactTemporalValue, end: ExactTemporalValue, removed = new Set<string>()) => {
    const next = scopedTail(context, tracks, start, end, removed);
    if (next.length > 0) commands.push({ kind: "item.move", ids: next, delta: subtractExactTemporalValues(start, end) });
    return next.length;
  };
  switch (edit.kind) {
    case "timeline.trim": {
      const { item } = selection([edit.item])[0]!;
      const at = time(edit.atFrame);
      const edge = edit.edge === "start" ? item.start : nleItemEnd(item);
      if (compare(edge, at) !== 0) {
        commands.push({ kind: "item.trim", id: item.id, edge: edit.edge, at });
        count = 1;
      }
      break;
    }
    case "timeline.slip": {
      const { item } = selection([edit.item])[0]!;
      if (item.kind !== "present" || item.source === "component") {
        throw new Error(`NLE Item ${item.id} requires Media or a Composition for slip.`);
      }
      if (edit.deltaFrames !== 0) {
        commands.push({ kind: "item.slip", id: item.id, delta: time(edit.deltaFrames) });
        count = 1;
      }
      break;
    }
    case "timeline.roll": {
      const items = selection([edit.left, edit.right]);
      const left = items.find(({ item }) => item.id === edit.left)!;
      const right = items.find(({ item }) => item.id === edit.right)!;
      if (left.item.id === right.item.id || left.track.id !== right.track.id
          || compare(nleItemEnd(left.item), right.item.start) !== 0) {
        throw new Error("NLE Studio roll requires two Items at a direct cut on one Track.");
      }
      const at = time(edit.atFrame);
      if (compare(at, right.item.start) !== 0) {
        commands.push({ kind: "item.roll", left: edit.left, right: edit.right, at });
        count = 2;
      }
      break;
    }
    case "timeline.ripple-trim": {
      const { track, item } = selection([edit.item])[0]!;
      const tracks = timelineScope(composition, edit.tracks);
      if (!tracks.includes(track)) throw new Error("NLE Studio ripple trim scope must include its Item's Track.");
      const at = time(edit.atFrame);
      const end = nleItemEnd(item);
      if (compare(at, end) === 0) break;
      const next = scopedTail(context, tracks, compare(at, end) < 0 ? at : end, end, new Set([item.id]));
      commands.push({ kind: "item.ripple-trim", id: item.id, edge: "end", at, scope: next });
      count = next.length + 1;
      break;
    }
    case "timeline.split": {
      const at = time(edit.atFrame);
      for (const { item } of selection(edit.items)) {
        if (compare(item.start, at) < 0 && compare(at, nleItemEnd(item)) < 0) {
          commands.push({ kind: "item.split", id: item.id, at, rightId: `split-${randomUUID()}` });
          count += 1;
        }
      }
      break;
    }
    case "timeline.remove":
      remove(new Set(selection(edit.items).map(({ item }) => item.id)));
      break;
    case "timeline.ripple-remove": {
      const tracks = timelineScope(composition, edit.tracks);
      const selected = selection(edit.items).sort((left, right) => compare(left.item.start, right.item.start));
      if (selected.some(({ track }) => !tracks.includes(track))) {
        throw new Error("NLE Studio ripple removal requires the Tracks of all selected Items.");
      }
      const start = selected[0]!.item.start;
      let end = nleItemEnd(selected[0]!.item);
      for (const { item } of selected.slice(1)) {
        if (compare(item.start, end) > 0) throw new Error("NLE Studio ripple removal requires a continuous range.");
        if (compare(nleItemEnd(item), end) > 0) end = nleItemEnd(item);
      }
      const removed = new Set(selected.map(({ item }) => item.id));
      remove(removed);
      close(tracks, start, end, removed);
      break;
    }
    case "timeline.close-gap": {
      const tracks = timelineScope(composition, edit.tracks);
      const at = time(edit.atFrame);
      let start = exactTemporalZero();
      let end: ExactTemporalValue | undefined;
      for (const { track, item } of entries) {
        if (!tracks.includes(track)) continue;
        const itemEnd = nleItemEnd(item);
        if (compare(itemEnd, at) <= 0) {
          if (compare(itemEnd, start) > 0) start = itemEnd;
        } else if (compare(item.start, at) <= 0) {
          throw new Error("NLE Studio playhead must lie in a gap on the chosen Tracks.");
        } else if (end === undefined || compare(item.start, end) < 0) {
          end = item.start;
        }
      }
      if (end === undefined) throw new Error("NLE Studio gap requires a following Item on the chosen Tracks.");
      count = close(tracks, start, end);
      break;
    }
  }
  return { commands, count };
}

export function allocateTimelinePlacement(context: ActiveTimeline, input: {
  readonly medium: NleTrack["kind"];
  readonly track: string | undefined;
  readonly purpose:
    | { readonly kind: "present"; readonly start: ExactTemporalValue; readonly duration: ExactTemporalValue }
    | { readonly kind: "adjust" };
}) {
  const { project, composition, view } = context;
  const { medium, purpose } = input;
  const tracks = composition.tracks.filter(track => track.kind === medium);
  const locked = (track: NleTrack) => nleViewTrackLocked(view, composition.id, track.id);
  const available = (track: NleTrack) => track.enabled && !locked(track);
  let selected: NleTrack | undefined;
  if (input.track !== undefined) {
    selected = tracks.find(track => track.id === input.track);
    if (selected === undefined) throw new Error(`NLE Studio placement requires a ${medium} Track in ${composition.id}.`);
    if (locked(selected)) throw new Error(`NLE Studio placement Track ${input.track} is locked.`);
  } else if (purpose.kind === "adjust") {
    const last = tracks.at(-1);
    if (last !== undefined && available(last)) selected = last;
  } else if (medium === "audio") {
    selected = tracks.find(available);
  } else {
    const end = addExactTemporalValues(purpose.start, purpose.duration);
    selected = tracks.reverse().find(track => available(track) && track.items.every(item =>
      item.kind === "present" && (
        compareExactTemporalValues(end, item.start) <= 0 || compareExactTemporalValues(nleItemEnd(item), purpose.start) <= 0
      )));
  }
  if (selected !== undefined) return { project, track: selected.id, commands: [] as readonly NleCommand[] };
  const track = { id: `track-${randomUUID()}`, name: medium === "picture" ? "视频轨道" : "音频轨道",
    kind: medium, enabled: true, items: [] } as const;
  const commands: readonly NleCommand[] = [{ kind: "track.add", composition: composition.id, track }];
  return { project: applyNleTransaction(project, { commands }), track: track.id, commands };
}

/** Studio Timeline allocation policy over current Project and View facts. */
export function planTimelineDrop(project: NleProject, view: NleView, drop: NleStudioTimelineDrop) {
  const composition = project.compositions.find(entry => entry.id === drop.composition);
  if (composition === undefined || view.activeComposition !== composition.id) {
    throw new Error(`NLE Studio drop targets inactive Composition ${drop.composition}.`);
  }
  const rows = [
    ...composition.tracks.filter(track => track.kind === "picture").reverse(),
    ...composition.tracks.filter(track => track.kind === "audio"),
  ];
  const ids = relatedItems(composition, view, drop.items);
  const entries = rows.flatMap(track => track.items.filter(item => ids.has(item.id)).map(item => ({ track, item })));
  if (!drop.items.includes(drop.anchor) || entries.length !== ids.size) {
    throw new Error("NLE Studio drop requires an anchor and selected Items in the active Composition.");
  }
  const anchorTrack = entries.find(entry => entry.item.id === drop.anchor)!.track;
  const locked = (track: NleTrack) => nleViewTrackLocked(view, composition.id, track.id);
  for (const { track } of entries) {
    if (locked(track)) throw new Error(`NLE Studio drop includes locked Track ${track.id}.`);
  }
  const targetTrack = drop.target.kind === "track" ? drop.target.track : drop.target.before;
  const target = targetTrack === undefined ? rows.length : rows.findIndex(track => track.id === targetTrack);
  if (target < 0) throw new Error(`NLE Studio drop targets unknown Track ${targetTrack}.`);
  let delta = studioFrameTime(drop.deltaFrames, view.editRate);
  const zero = exactTemporalZero();
  for (const { item } of entries) {
    if (compareExactTemporalValues(addExactTemporalValues(item.start, delta), zero) < 0) {
      delta = subtractExactTemporalValues(zero, item.start);
    }
  }
  if (drop.target.kind === "track" && drop.target.track === anchorTrack.id
    && compareExactTemporalValues(delta, zero) === 0) {
    return { commands: [], anchorTrack: anchorTrack.id };
  }
  const commands: NleCommand[] = [];
  const destinations: { item: string; track: string }[] = [];
  const sourceRows = [...rows];
  const sourceIndex = sourceRows.indexOf(anchorTrack);

  const placeLane = (source: NleTrack, desired: number, minimum: number, maximum: number, forceNew = false) => {
    const members = source.items.filter(item => ids.has(item.id));
    const candidates = rows.map((track, index) => ({ track, index }))
      .filter(({ track, index }) => index >= minimum && index < maximum
        && track.kind === source.kind && !locked(track)
        && (track.kind === "audio" || track.items.every(other => ids.has(other.id)
          || members.every(item => !pictureCollision(item, other, delta)))))
      .sort((left, right) => Math.abs(left.index - desired) - Math.abs(right.index - desired));
    let destination = forceNew ? undefined : candidates[0]?.track;
    if (destination === undefined) {
      const audioStart = rows.filter(track => track.kind === "picture").length;
      const low = Math.max(minimum, source.kind === "picture" ? 0 : audioStart);
      const high = Math.min(maximum, source.kind === "picture" ? audioStart : rows.length);
      const index = Math.max(low, Math.min(high, desired));
      const adjacent = source.kind === "picture" ? rows[index - 1] : rows[index];
      const before = adjacent?.kind === source.kind ? adjacent.id : undefined;
      destination = {
        id: `track-${randomUUID()}`, name: source.kind === "picture" ? "视频轨道" : "音频轨道",
        kind: source.kind, enabled: true, items: [],
      };
      commands.push({ kind: "track.add", composition: composition.id, track: destination, ...(before === undefined ? {} : { before }) });
      rows.splice(index, 0, destination);
    }
    if (destination.id !== source.id) {
      for (const item of members) destinations.push({ item: item.id, track: destination.id });
    }
    return destination;
  };
  const anchor = placeLane(anchorTrack, target, 0, rows.length, drop.target.kind === "gap");
  let neighbor = anchor;
  for (let index = sourceIndex - 1; index >= 0; index -= 1) {
    const source = sourceRows[index]!;
    if (!source.items.some(item => ids.has(item.id))) continue;
    const limit = rows.indexOf(neighbor);
    const desired = rows.indexOf(anchor) + index - sourceIndex;
    neighbor = placeLane(source, desired, 0, limit);
  }
  neighbor = anchor;
  for (let index = sourceIndex + 1; index < sourceRows.length; index += 1) {
    const source = sourceRows[index]!;
    if (!source.items.some(item => ids.has(item.id))) continue;
    const limit = rows.indexOf(neighbor) + 1;
    const desired = rows.indexOf(anchor) + index - sourceIndex;
    neighbor = placeLane(source, desired, limit, rows.length);
  }
  if (destinations.length > 0 || compareExactTemporalValues(delta, zero) !== 0) {
    commands.push({ kind: "item.move", ids: entries.map(({ item }) => item.id), delta, destinations });
  }
  return { commands, anchorTrack: anchor.id };
}

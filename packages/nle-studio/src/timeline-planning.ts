import { randomUUID } from "node:crypto";
import { applyNleTransaction, createMediaAssetMaterialization, createTransitionMaterialization, indexNleComposition, nleDirectTransitionCuts, nleGroupMoveItems, nleItemEnd, nleLinearTimeMapping, type NleCommand, type NleComposition, type NleIndexedItem, type NleItem, type NleProject, type NleTrack } from "@hypit/nle";
import { nleTrackStackingNeighbors, orderNleTimelineTracks, resolveNleTimelineItemCapabilities } from "@hypit/nle/surface";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  extrapolateTemporalAffineMapPiece,
  isAffineTemporalMapPiece,
  subtractExactTemporalValues,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import type { NleStudioDropDestination, NleStudioTimelineDrop, NleStudioTimelineEdit } from "./protocol.js";
import { studioFrameTime } from "./timeline-time.js";

function relatedItems(composition: NleComposition, seeds: readonly string[], exceptTransition?: string): Set<string> {
  const relations = [
    ...composition.transitions.filter(transition => transition.id !== exceptTransition)
      .map(transition => [transition.outgoing, transition.incoming]),
    ...composition.mattes.map(matte => [matte.content, matte.matte]),
  ];
  let selected = new Set(seeds);
  let previousSize: number;
  do {
    previousSize = selected.size;
    selected = nleGroupMoveItems(composition, selected);
    for (const members of relations) {
      if (members.some(item => selected.has(item))) for (const item of members) selected.add(item);
    }
  } while (selected.size !== previousSize);
  return selected;
}

function overlapsAfterMove(item: NleItem, other: NleItem, delta: ExactTemporalValue): boolean {
  return compareExactTemporalValues(addExactTemporalValues(item.start, delta), nleItemEnd(other)) < 0
    && compareExactTemporalValues(other.start, addExactTemporalValues(nleItemEnd(item), delta)) < 0;
}

type ActiveTimeline = { readonly project: NleProject; readonly composition: NleComposition; readonly lockedTracks: ReadonlySet<string> };

export function resolveTransitionCut(composition: NleComposition, trackId: string, at: ExactTemporalValue) {
  const track = composition.tracks.find(track => track.id === trackId);
  const cut = track && nleDirectTransitionCuts(composition, track).find(cut => compareExactTemporalValues(cut.at, at) === 0);
  if (cut === undefined) {
    throw new Error(`NLE Studio Transition requires one Picture cut on Track ${trackId} at the selected frame.`);
  }
  return [cut.outgoing, cut.incoming] as const;
}

function timelineTail(composition: NleComposition, track: NleTrack, at: ExactTemporalValue, exceptTransition?: string): Set<string> {
  const tail = track.items.filter(item => compareExactTemporalValues(item.start, at) >= 0);
  return relatedItems(composition, tail.map(item => item.id), exceptTransition);
}

function assertTailDisplacement({ composition, lockedTracks }: ActiveTimeline, sourceTrack: NleTrack, cut: ExactTemporalValue,
  moving: ReadonlySet<string>, delta: ExactTemporalValue, edit: string,
  overlap?: { readonly moving: string; readonly stationary: string }): void {
  const fixedPrefix = sourceTrack.items.find(item => moving.has(item.id) && compareExactTemporalValues(item.start, cut) < 0);
  if (fixedPrefix !== undefined) {
    throw new Error(`NLE Studio ${edit} cannot move fixed Item ${fixedPrefix.name ?? fixedPrefix.id} before the cut.`);
  }

  const zero = exactTemporalZero();
  const leftward = compareExactTemporalValues(delta, zero) < 0;
  for (const track of composition.tracks) {
    const members = track.items.filter(item => moving.has(item.id));
    if (members.length === 0) continue;
    if (lockedTracks.has(track.id)) throw new Error(`NLE Studio ${edit} would move Items on locked Track ${track.name}.`);
    const stationary = track.items.filter(item => !moving.has(item.id)).map(item => ({ item, end: nleItemEnd(item) }));
    for (const item of members) {
      const start = addExactTemporalValues(item.start, delta);
      if (compareExactTemporalValues(start, zero) < 0) {
        throw new Error(`NLE Studio ${edit} would move Item ${item.name ?? item.id} before Programme time zero.`);
      }
      const oldEnd = nleItemEnd(item);
      const end = addExactTemporalValues(oldEnd, delta);
      // Only the part of the final window outside the old window introduces new overlap.
      const addedStart = !leftward && compareExactTemporalValues(start, oldEnd) < 0 ? oldEnd : start;
      const addedEnd = leftward && compareExactTemporalValues(end, item.start) > 0 ? item.start : end;
      const blocker = stationary.find(other => !(item.id === overlap?.moving && other.item.id === overlap.stationary)
        && compareExactTemporalValues(other.item.start, addedEnd) < 0 && compareExactTemporalValues(addedStart, other.end) < 0);
      if (blocker !== undefined) {
        throw new Error(`NLE Studio ${edit} would move Item ${item.name ?? item.id} over ${blocker.item.name ?? blocker.item.id} on Track ${track.name}.`);
      }
    }
  }
}

export function planTimelineTransitionMaterialization(
  context: ActiveTimeline,
  input: Omit<Parameters<typeof createTransitionMaterialization>[1], "composition" | "movingItems">,
): readonly NleCommand[] {
  const { project, composition } = context;
  const incoming = indexNleComposition(composition).item(input.incoming);
  if (incoming === undefined) throw new Error(`Unknown NLE Transition incoming Item ${input.incoming} in ${composition.id}.`);
  const moving = timelineTail(composition, incoming.track, incoming.item.start);
  const materialization = createTransitionMaterialization(project, { ...input, composition: composition.id, movingItems: [...moving] });
  assertTailDisplacement(context, incoming.track, incoming.item.start, moving, subtractExactTemporalValues(exactTemporalZero(), input.duration),
    "Transition", { moving: input.incoming, stationary: input.outgoing });
  return materialization.commands;
}

export function planTimelineTransitionRemoval(
  context: ActiveTimeline,
  transition: NleComposition["transitions"][number],
): readonly NleCommand[] {
  const { composition } = context;
  const index = indexNleComposition(composition);
  const outgoing = index.item(transition.outgoing)!.item;
  const incoming = index.item(transition.incoming)!;
  const overlap = subtractExactTemporalValues(nleItemEnd(outgoing), incoming.item.start);
  const moving = timelineTail(composition, incoming.track, incoming.item.start, transition.id);
  assertTailDisplacement(context, incoming.track, incoming.item.start, moving, overlap, "Transition");
  return [{ kind: "transition.remove", id: transition.id }, { kind: "item.move", ids: [...moving], delta: overlap }];
}

export function planFreezeInsertion(context: ActiveTimeline, source: NleIndexedItem, hold: NleItem): readonly NleCommand[] {
  const { project, composition, lockedTracks } = context;
  const { track, item } = source;
  const at = hold.start;
  const crossing = track.items.find(other => other.id !== item.id && compareExactTemporalValues(other.start, at) < 0
    && compareExactTemporalValues(at, nleItemEnd(other)) < 0);
  if (crossing !== undefined) {
    throw new Error(`NLE Studio Freeze cut crosses Item ${crossing.name ?? crossing.id} on Track ${track.name}.`);
  }
  const splits = compareExactTemporalValues(item.start, at) < 0 ? planTimelineSplits(context, [item.id], at) : [];
  const split = splits[0];
  // The split's right piece already inherits its Group when the moving set is resolved.
  const sliced = split === undefined ? project : applyNleTransaction(project, { commands: splits });
  const slicedComposition = sliced.compositions.find(entry => entry.id === composition.id)!;
  const slicedTrack = slicedComposition.tracks.find(entry => entry.id === track.id)!;
  const moving = timelineTail(slicedComposition, slicedTrack, at);
  assertTailDisplacement({ project: sliced, composition: slicedComposition, lockedTracks }, slicedTrack, at, moving, hold.duration, "Freeze");
  return [
    ...splits,
    { kind: "item.move", ids: [...moving], delta: hold.duration },
    { kind: "item.add", track: track.id, item: hold, before: split?.rightId ?? item.id },
  ];
}

export function planTransitionWindow(
  { composition }: ActiveTimeline,
  transition: NleComposition["transitions"][number],
  duration: ExactTemporalValue,
): readonly NleCommand[] {
  const items = composition.tracks.flatMap(track => track.items);
  const left = items.find(item => item.id === transition.outgoing)!;
  const right = items.find(item => item.id === transition.incoming)!;
  const delta = subtractExactTemporalValues(subtractExactTemporalValues(nleItemEnd(left), right.start), duration);
  if (compareExactTemporalValues(delta, exactTemporalZero()) === 0) return [];
  assertTransitionMove(composition, right.id, transition.id);
  return [{ kind: "item.move", ids: [right.id], delta }];
}

function assertTransitionMove(composition: NleComposition, incoming: string, transition: string) {
  if (relatedItems(composition, [incoming], transition).size > 1) {
    throw new Error(`NLE Studio Transition cannot displace linked Item ${incoming}.`);
  }
}

function timelineScope(composition: NleComposition, tracks: readonly string[]) {
  const ids = new Set(tracks);
  const selected = composition.tracks.filter(track => ids.has(track.id));
  if (selected.length === 0 || selected.length !== tracks.length) {
    throw new Error(`NLE Studio scoped edit requires distinct Tracks in Composition ${composition.id}.`);
  }
  return selected;
}

function scopedTail(
  { composition }: ActiveTimeline,
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
  for (const linked of relatedItems(composition, next)) {
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

/** The one source window whose rate the Studio can author directly. */
export function nleRetimeWindow(item: NleItem) {
  if (item.kind !== "present" || item.source === "component" || (item.picture === undefined && item.audio === undefined)) return undefined;
  const piece = item.sourceTime.pieces[0];
  return item.sourceTime.pieces.length === 1 && piece !== undefined && isAffineTemporalMapPiece(piece)
    && piece.wrap === undefined && compareExactTemporalValues(piece.target.start, exactTemporalZero()) === 0
    && compareExactTemporalValues(piece.target.end, item.duration) === 0 ? piece : undefined;
}

export function timelineCutItems(composition: NleComposition, ids: readonly string[], at: ExactTemporalValue): string[] {
  const selected = new Set(ids);
  return composition.tracks.flatMap(track => track.items
    .filter(item => selected.has(item.id)
      && compareExactTemporalValues(item.start, at) < 0 && compareExactTemporalValues(at, nleItemEnd(item)) < 0)
    .map(item => item.id));
}

function planTimelineSplits(context: ActiveTimeline, ids: readonly string[], at: ExactTemporalValue): Extract<NleCommand, { kind: "item.split" }>[] {
  const { project, composition, lockedTracks } = context;
  const available = new Set(resolveNleTimelineItemCapabilities(project, { activeComposition: composition.id, lockedTracks })
    .filter(capability => capability.split).map(capability => capability.item));
  const targets = new Set(timelineCutItems(composition, ids, at));
  return ids.map(id => {
    if (!targets.has(id)) throw new Error(`NLE Studio split must lie inside Item ${id}.`);
    if (!available.has(id)) throw new Error(`NLE Studio cannot split Item ${id} on a locked Track or with a Transition or Matte.`);
    return { kind: "item.split", id, at, rightId: `split-${randomUUID()}` };
  });
}

export function planTimelineEdit(context: ActiveTimeline, edit: NleStudioTimelineEdit) {
  const { project, composition } = context;
  const entries = composition.tracks.flatMap(track => track.items.map(item => ({ track, item })));
  const selection = (ids: readonly string[]) => {
    const selected = new Set(ids);
    const found = entries.filter(({ item }) => selected.has(item.id));
    if (found.length === 0 || found.length !== selected.size) {
      throw new Error(`NLE Studio edit requires existing Items in Composition ${composition.id}.`);
    }
    return found;
  };
  const time = (frame: number) => studioFrameTime(frame, project.editRate);
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
    case "timeline.item-reorder": {
      const { track, item } = selection([edit.item])[0]!;
      if (context.lockedTracks.has(track.id)) throw new Error(`NLE Studio Track ${track.id} is locked.`);
      const transitionItems = new Set(composition.transitions.flatMap(({ outgoing, incoming }) => [outgoing, incoming]));
      const neighbor = nleTrackStackingNeighbors(track, transitionItems).get(item.id)?.[edit.direction];
      if (neighbor !== undefined) {
        const before = edit.direction === "up" ? track.items[track.items.findIndex(entry => entry.id === neighbor) + 1]?.id : neighbor;
        commands.push({ kind: "item.reorder", id: item.id, ...(before === undefined ? {} : { before }) });
        count = 1;
      }
      break;
    }
    case "timeline.trim": {
      const at = time(edit.atFrame);
      for (const { item } of selection(edit.items)) {
        const edge = edit.edge === "start" ? item.start : nleItemEnd(item);
        if (compare(edge, at) !== 0) {
          commands.push({ kind: "item.trim", id: item.id, edge: edit.edge, at });
          count += 1;
        }
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
    case "timeline.retime": {
      const { item } = selection([edit.item])[0]!;
      const piece = nleRetimeWindow(item);
      if (item.kind !== "present" || piece === undefined) {
        throw new Error(`NLE Item ${item.id} retime requires one affine source window on a Media or Composition Present.`);
      }
      if (item.audio !== undefined && edit.rate.numerator <= 0) {
        throw new Error(`NLE Item ${item.id} Audio retime requires a positive rate.`);
      }
      if (edit.rate.numerator === 0) throw new Error("NLE Studio speed rate must be nonzero.");
      const previousEnd = extrapolateTemporalAffineMapPiece(piece, item.duration);
      const previousDirection = Math.sign(piece.rate.numerator);
      const sameDirection = previousDirection === 0 || previousDirection === Math.sign(edit.rate.numerator);
      if (BigInt(piece.rate.numerator) * BigInt(edit.rate.denominator)
          === BigInt(edit.rate.numerator) * BigInt(piece.rate.denominator)) break;
      const anchor = sameDirection ? piece.sourceAtStart : previousEnd;
      commands.push({ kind: "item.retime", id: item.id, time: nleLinearTimeMapping(item.duration, anchor, edit.rate) });
      count = 1;
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
      commands.push(...planTimelineSplits(context, selection(edit.items).map(({ item }) => item.id), time(edit.atFrame)));
      count = commands.length;
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
  readonly role: NleTrack["role"];
  readonly track: string | undefined;
  readonly purpose:
    | { readonly kind: "present"; readonly start: ExactTemporalValue; readonly duration: ExactTemporalValue }
    | { readonly kind: "adjust" };
}) {
  const { project, composition, lockedTracks } = context;
  const { medium, role, purpose } = input;
  const tracks = composition.tracks.filter(track => track.kind === medium);
  const locked = (track: NleTrack) => lockedTracks.has(track.id);
  const available = (track: NleTrack) => !locked(track);
  let selected: NleTrack | undefined;
  if (input.track !== undefined) {
    selected = tracks.find(track => track.id === input.track);
    if (selected === undefined) throw new Error(`NLE Studio placement requires a ${medium} Track in ${composition.id}.`);
    if (selected.role !== role) throw new Error(`NLE Studio placement requires Track role ${role}.`);
    if (locked(selected)) throw new Error(`NLE Studio placement Track ${input.track} is locked.`);
  } else if (purpose.kind === "adjust") {
    const last = tracks.at(-1);
    if (last && last.role === role && available(last)) selected = last;
  } else {
    const end = addExactTemporalValues(purpose.start, purpose.duration);
    const candidates = medium === "picture" ? tracks.reverse() : tracks;
    selected = candidates.find(track => track.role === role && available(track) && track.items.every(item =>
      compareExactTemporalValues(end, item.start) <= 0 || compareExactTemporalValues(nleItemEnd(item), purpose.start) <= 0
    ));
  }
  if (selected !== undefined) return { project, track: selected.id, commands: [] as readonly NleCommand[] };
  const track = makeTrack(medium, role);
  const commands: readonly NleCommand[] = [{ kind: "track.add", composition: composition.id, track }];
  return { project: applyNleTransaction(project, { commands }), track: track.id, commands };
}

function makeTrack(kind: NleTrack["kind"], role: NleTrack["role"]): NleTrack {
  const names = { picture: "画面轨道", audio: "音频轨道", text: "文字轨道", subtitle: "字幕轨道", filter: "滤镜轨道", effect: "特效轨道" };
  return { id: `track-${randomUUID()}`, name: names[role], kind, role, pictureEnabled: kind === "picture", audioEnabled: true, items: [] };
}

type MediaPlacementSource = Pick<Parameters<typeof createMediaAssetMaterialization>[1], "asset" | "interpretation">;

export function defaultMediaPlacementDuration(project: NleProject, interpretation: MediaPlacementSource["interpretation"]) {
  const { numerator, denominator } = project.editRate;
  return interpretation.domain?.duration ?? studioFrameTime(Math.max(1, Math.round(5 * numerator / denominator)), project.editRate);
}

export function planMediaOnNewTracks(project: NleProject, composition: NleComposition,
  media: readonly MediaPlacementSource[], start: ExactTemporalValue) {
  if (media.length === 0) throw new Error("NLE Studio placement requires at least one Media Asset.");
  const roleOf = ({ interpretation }: MediaPlacementSource) => interpretation.picture === undefined ? "audio" : "picture";
  const roles = new Set(media.map(roleOf));
  const destinations = new Map<"audio" | "picture", { track: string; next: ExactTemporalValue }>();
  const commands: NleCommand[] = [];
  // Appending to the authored track list places each new track at the top of the Timeline.
  for (const role of ["audio", "picture"] as const) {
    if (!roles.has(role)) continue;
    const track = makeTrack(role, role);
    commands.push({ kind: "track.add", composition: composition.id, track });
    destinations.set(role, { track: track.id, next: start });
  }
  const withTracks = applyNleTransaction(project, { commands });
  const items = media.map(source => {
    const destination = destinations.get(roleOf(source))!;
    const duration = defaultMediaPlacementDuration(project, source.interpretation);
    const itemId = `media-${randomUUID()}`;
    commands.push(...createMediaAssetMaterialization(withTracks, {
      ...source, itemId, track: destination.track, at: destination.next, duration,
    }).commands);
    destination.next = addExactTemporalValues(destination.next, duration);
    return itemId;
  });
  return { commands, item: items[0]!, count: items.length };
}

export function planMediaDropPlacement(context: ActiveTimeline, target: NleStudioDropDestination,
  medium: "picture" | "audio", start: ExactTemporalValue, duration: ExactTemporalValue) {
  const { project, composition } = context;
  if ("gap" in target) {
    const rows = orderNleTimelineTracks(composition.tracks);
    const index = target.before === undefined ? rows.length : rows.findIndex(track => track.id === target.before);
    if (index < 0) throw new Error(`Unknown NLE Studio Media drop boundary ${target.before}.`);
    const track = makeTrack(medium, medium);
    const before = rows[index - 1]?.id;
    const commands: readonly NleCommand[] = [
      { kind: "track.add", composition: composition.id, track, ...(before === undefined ? {} : { before }) },
    ];
    return { project: applyNleTransaction(project, { commands }), track: track.id, commands, shifted: [] as readonly string[] };
  }
  const placement = allocateTimelinePlacement(context, {
    medium, role: medium, track: target.track, purpose: { kind: "present", start, duration },
  });
  const track = composition.tracks.find(entry => entry.id === target.track)!;
  const compare = compareExactTemporalValues;
  const end = addExactTemporalValues(start, duration);
  const occupied = track.items.some(item => compare(item.start, end) < 0 && compare(start, nleItemEnd(item)) < 0);
  const insert = medium === "picture" && track.items.some(item => compare(item.start, start) === 0);
  if (insert) {
    const commands = planTimelineInsertion(context, track.id, [track.id], start, duration);
    const shifted = commands.flatMap(command => command.kind === "item.move" ? command.ids : []);
    return { ...placement, commands, shifted };
  }
  if (occupied) throw new Error("目标轨道没有足够的空白放入素材");
  return { ...placement, shifted: [] as readonly string[] };
}

export function planAudioDetachment(context: ActiveTimeline, id: string, destination?: string) {
  const { composition } = context;
  const source = indexNleComposition(composition).item(id);
  if (source === undefined) throw new Error(`Unknown NLE Item ${id} in Composition ${composition.id}.`);

  const commands: NleCommand[] = [];
  let target: string;
  if (destination === undefined) {
    const track = { ...makeTrack("audio", "audio"), audioEnabled: source.track.audioEnabled };
    commands.push({ kind: "track.add", composition: composition.id, track, before: source.track.id });
    target = track.id;
  } else {
    const placement = allocateTimelinePlacement(context, {
      medium: "audio", role: "audio", track: destination,
      purpose: { kind: "present", start: source.item.start, duration: source.item.duration },
    });
    commands.push(...placement.commands);
    target = placement.track;
  }
  const item = `audio-${randomUUID()}`;
  commands.push({ kind: "item.detach-audio", id, track: target, audioItemId: item });
  return { commands, item, track: target };
}

function planTrackArrangement(rows: readonly NleTrack[], block: readonly NleTrack[], gap: number): readonly NleCommand[] {
  const moved = new Set(block);
  const ordered = rows.filter(track => !moved.has(track));
  const index = rows.slice(0, gap).filter(track => !moved.has(track)).length;
  ordered.splice(index, 0, ...block);
  if (ordered.every((track, index) => track === rows[index])) return [];

  return ordered.flatMap((track, index): NleCommand[] => {
    const before = ordered[index - 1]?.id;
    return moved.has(track) ? [{ kind: "track.move", id: track.id, ...(before === undefined ? {} : { before }) }] : [];
  });
}

export function planTimelineTrackReorder(composition: NleComposition, lockedTracks: ReadonlySet<string>, track: string,
  before: string | undefined): readonly NleCommand[] {
  const rows = orderNleTimelineTracks(composition.tracks);
  const moved = rows.find(row => row.id === track);
  if (moved === undefined) throw new Error(`NLE Studio cannot reorder unknown Track ${track}.`);
  if (lockedTracks.has(track)) throw new Error(`NLE Studio cannot reorder locked Track ${track}.`);
  const target = before === undefined ? rows.length : rows.findIndex(row => row.id === before);
  if (target < 0) throw new Error(`NLE Studio reorder targets unknown Track ${before}.`);
  return planTrackArrangement(rows, [moved], target);
}

/** Studio Timeline allocation policy over current Project and session locks. */
export function planTimelineDrop(context: ActiveTimeline, drop: NleStudioTimelineDrop): {
  readonly commands: readonly NleCommand[];
  readonly anchorTrack: string;
  readonly destination: NleStudioDropDestination;
} {
  const { project, composition, lockedTracks } = context;
  const rows = [...orderNleTimelineTracks(composition.tracks)];
  const ids = relatedItems(composition, drop.items);
  const entries = rows.flatMap(track => track.items.filter(item => ids.has(item.id)).map(item => ({ track, item })));
  if (!drop.items.includes(drop.anchor) || entries.length !== ids.size) {
    throw new Error("NLE Studio drop requires an anchor and selected Items in the active Composition.");
  }
  const anchorTrack = entries.find(entry => entry.item.id === drop.anchor)!.track;
  const locked = (track: NleTrack) => lockedTracks.has(track.id);
  for (const { track } of entries) {
    if (locked(track)) throw new Error(`NLE Studio drop includes locked Track ${track.id}.`);
  }
  const targetTrack = drop.target.kind === "track" ? drop.target.track : drop.target.before;
  const target = targetTrack === undefined ? rows.length : rows.findIndex(track => track.id === targetTrack);
  if (target < 0) throw new Error(`NLE Studio drop targets unknown Track ${targetTrack}.`);
  let delta = studioFrameTime(drop.deltaFrames, project.editRate);
  if (drop.alignment !== undefined) {
    const { item, edge, neighbor } = drop.alignment;
    const moving = anchorTrack.items.find(candidate => candidate.id === item && ids.has(candidate.id));
    const stationary = drop.target.kind === "track" && !ids.has(neighbor)
      ? rows[target]?.items.find(candidate => candidate.id === neighbor) : undefined;
    if (!moving || !stationary) throw new Error("NLE Studio edge alignment requires a moved Item and a stationary neighbor on the destination Track.");
    delta = edge === "start" ? subtractExactTemporalValues(nleItemEnd(stationary), moving.start)
      : subtractExactTemporalValues(stationary.start, nleItemEnd(moving));
  }
  const zero = exactTemporalZero();
  for (const { item } of entries) {
    if (compareExactTemporalValues(addExactTemporalValues(item.start, delta), zero) < 0) {
      delta = subtractExactTemporalValues(zero, item.start);
    }
  }
  const changesTime = compareExactTemporalValues(delta, zero) !== 0;
  const currentTrack = { track: anchorTrack.id };
  const commands: NleCommand[] = [];
  if (drop.target.kind === "gap") {
    const selectedTracks = new Set(entries.map(({ track }) => track));
    const block = rows.filter(track => selectedTracks.has(track));
    const first = rows.indexOf(block[0]!);
    const end = first + block.length;
    if (rows[end - 1] === block.at(-1) && block.every(track => track.items.every(item => ids.has(item.id)))) {
      const trackMoves = planTrackArrangement(rows, block, target);
      let destination: NleStudioDropDestination = currentTrack;
      if (trackMoves.length > 0) {
        const before = rows[target]?.id;
        destination = { gap: true, ...(before === undefined ? {} : { before }) };
      }
      commands.push(...trackMoves);
      if (changesTime) commands.push({ kind: "item.move", ids: [...ids], delta });
      return { commands, anchorTrack: anchorTrack.id, destination };
    }
  } else {
    const lane = rows[target]!;
    if (lane.kind !== anchorTrack.kind || lane.role !== anchorTrack.role || locked(lane)
      || (lane.id === anchorTrack.id && !changesTime)) {
      return { commands, anchorTrack: anchorTrack.id, destination: currentTrack };
    }
  }
  const destinations: { item: string; track: string }[] = [];
  const sourceRows = [...rows];
  const sourceIndex = sourceRows.indexOf(anchorTrack);
  const membersByTrack = new Map<NleTrack, NleItem[]>();
  for (const { track, item } of entries) {
    const members = membersByTrack.get(track) ?? [];
    members.push(item);
    membersByTrack.set(track, members);
  }
  const placeLane = (source: NleTrack, desired: number, minimum: number, maximum: number, forceNew = false) => {
    const members = membersByTrack.get(source)!;
    const candidates = rows.map((track, index) => ({ track, index }))
      .filter(({ track, index }) => index >= minimum && index < maximum
        && track.kind === source.kind && track.role === source.role && !locked(track)
        && track.items.every(other => ids.has(other.id)
          || members.every(item => !overlapsAfterMove(item, other, delta))))
      .sort((left, right) => Math.abs(left.index - desired) - Math.abs(right.index - desired));
    let destination = forceNew ? undefined : candidates[0]?.track;
    if (destination === undefined) {
      const index = Math.max(minimum, Math.min(maximum, desired));
      const before = rows[index - 1]?.id;
      destination = { ...makeTrack(source.kind, source.role), pictureEnabled: source.pictureEnabled, audioEnabled: source.audioEnabled };
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
  if (destinations.length > 0 || changesTime) {
    commands.push({ kind: "item.move", ids: entries.map(({ item }) => item.id), delta, destinations });
  }
  if (sourceRows.includes(anchor)) return { commands, anchorTrack: anchor.id, destination: { track: anchor.id } };
  const before = rows.slice(rows.indexOf(anchor) + 1).find(track => sourceRows.includes(track))?.id;
  return { commands, anchorTrack: anchor.id, destination: { gap: true, ...(before === undefined ? {} : { before }) } };
}

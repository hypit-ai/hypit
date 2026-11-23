import { randomUUID } from "node:crypto";
import { applyNleTransaction, indexNleComposition, nleGroupMoveItems, nleItemEnd, nleLinearTimeMapping, type NleCommand, type NleComposition, type NleItem, type NleProject, type NleTrack } from "@hypit/nle";
import { orderNleTimelineTracks } from "@hypit/nle/surface";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  extrapolateTemporalAffineMapPiece,
  isAffineTemporalMapPiece,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalRate,
} from "@hypit/temporal/algebra";
import type { NleStudioDropDestination, NleStudioTimelineDrop, NleStudioTimelineEdit } from "./protocol.js";

export function studioFrameTime(frame: number, rate: TemporalRate): ExactTemporalValue {
  if (!Number.isSafeInteger(frame)) throw new Error("NLE Studio frame must be a safe integer.");
  return { ticks: String(BigInt(frame) * BigInt(rate.denominator)), timeBase: { numerator: 1, denominator: rate.numerator } };
}

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
  const track = composition.tracks.find(track => track.id === trackId && track.kind === "picture");
  const pictures = track?.items.filter(item => item.kind === "present" && item.enabled) ?? [];
  const left = pictures.filter(item => compareExactTemporalValues(nleItemEnd(item), at) === 0);
  const right = pictures.filter(item => compareExactTemporalValues(item.start, at) === 0);
  if (left.length !== 1 || right.length !== 1) {
    throw new Error(`NLE Studio Transition requires one Picture cut on Track ${trackId} at the selected frame.`);
  }
  return [left[0]!, right[0]!] as const;
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

export function assertTransitionMove(composition: NleComposition, incoming: string, transition?: string) {
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
  const available = (track: NleTrack) => track.enabled && !locked(track);
  let selected: NleTrack | undefined;
  if (input.track !== undefined) {
    selected = tracks.find(track => track.id === input.track);
    if (selected === undefined) throw new Error(`NLE Studio placement requires a ${medium} Track in ${composition.id}.`);
    if (selected.role !== role) throw new Error(`NLE Studio placement requires Track role ${role}.`);
    if (locked(selected)) throw new Error(`NLE Studio placement Track ${input.track} is locked.`);
    if (!selected.enabled) throw new Error(`NLE Studio placement Track ${input.track} is disabled.`);
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
  return { id: `track-${randomUUID()}`, name: names[role], kind, role, enabled: true, items: [] };
}

export function planAudioDetachment(context: ActiveTimeline, id: string, destination?: string) {
  const { composition } = context;
  const source = indexNleComposition(composition).item(id);
  if (source === undefined) throw new Error(`Unknown NLE Item ${id} in Composition ${composition.id}.`);

  const commands: NleCommand[] = [];
  let target: string;
  if (destination === undefined) {
    const track = { ...makeTrack("audio", "audio"), enabled: source.track.enabled };
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
      destination = makeTrack(source.kind, source.role);
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

import { randomUUID } from "node:crypto";
import { applyNleTransaction, nleItemEnd, nleLinearTimeMapping, type NleCommand, type NleComposition, type NleItem, type NleProject, type NleTrack } from "@hypit/nle";
import { nleViewCompositionState, nleViewTrackLocked, orderNleTimelineTracks, type NleView } from "@hypit/nle/view";
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
import type { NleStudioPackageBridge } from "./packages.js";

export function studioFrameTime(frame: number, rate: TemporalRate): ExactTemporalValue {
  if (!Number.isSafeInteger(frame)) throw new Error("NLE Studio frame must be a safe integer.");
  return { ticks: String(BigInt(frame) * BigInt(rate.denominator)), timeBase: { numerator: 1, denominator: rate.numerator } };
}

function relatedItems(composition: NleComposition, view: NleView, seeds: readonly string[], exceptTransition?: string): Set<string> {
  const relations = [
    ...(nleViewCompositionState(view, composition.id)?.groups.map(group => group.items) ?? []),
    ...composition.transitions.filter(transition => transition.id !== exceptTransition)
      .map(transition => [transition.outgoing, transition.incoming]),
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

function overlapsAfterMove(item: NleItem, other: NleItem, delta: ExactTemporalValue): boolean {
  return compareExactTemporalValues(addExactTemporalValues(item.start, delta), nleItemEnd(other)) < 0
    && compareExactTemporalValues(other.start, addExactTemporalValues(nleItemEnd(item), delta)) < 0;
}

type ActiveTimeline = { readonly project: NleProject; readonly composition: NleComposition; readonly view: NleView };

export function studioTextItems(composition: NleComposition, offerings: NleStudioPackageBridge["components"]) {
  const componentKey = ({ package: name, symbol }: { readonly package: string; readonly symbol: string }) => `${name}\0${symbol}`;
  const graphics = new Set(offerings.filter(entry => entry.value.category === "graphic").map(entry => componentKey(entry.value.component)));
  const text = new Set(offerings.filter(entry => entry.value.category === "text").map(entry => componentKey(entry.value.component)));
  const ids = composition.tracks.flatMap(track => track.items.flatMap(item => {
    if (item.kind !== "present" || item.source !== "component" || item.role === "subtitle") return [];
    const key = componentKey(item.component);
    return track.role === "text" || (text.has(key) && !graphics.has(key)) ? [item.id] : [];
  }));
  return new Set(ids);
}

export function studioTrackRole(track: NleTrack, textItems: ReadonlySet<string>): NleTrack["role"] {
  if (track.role !== undefined || track.items.length === 0) return track.role;
  if (track.items.every(item => item.kind === "adjust")) return "effect";
  if (track.kind === "picture" && track.items.every(item => textItems.has(item.id))) return "text";
}

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
  { composition, view }: ActiveTimeline,
  transition: NleComposition["transitions"][number],
  duration: ExactTemporalValue,
): readonly NleCommand[] {
  const items = composition.tracks.flatMap(track => track.items);
  const left = items.find(item => item.id === transition.outgoing)!;
  const right = items.find(item => item.id === transition.incoming)!;
  const delta = subtractExactTemporalValues(subtractExactTemporalValues(nleItemEnd(left), right.start), duration);
  if (compareExactTemporalValues(delta, exactTemporalZero()) === 0) return [];
  assertTransitionMove(composition, view, right.id, transition.id);
  return [{ kind: "item.move", ids: [right.id], delta }];
}

export function assertTransitionMove(composition: NleComposition, view: NleView, incoming: string, transition?: string) {
  if (relatedItems(composition, view, [incoming], transition).size > 1) {
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

/** The one source window whose rate the Studio can author directly. */
export function nleRetimeWindow(item: NleItem) {
  if (item.kind !== "present" || item.source === "component" || item.picture === undefined || item.audio !== undefined) return undefined;
  const piece = item.sourceTime.pieces[0];
  return item.sourceTime.pieces.length === 1 && piece !== undefined && isAffineTemporalMapPiece(piece)
    && piece.wrap === undefined && compareExactTemporalValues(piece.target.start, exactTemporalZero()) === 0
    && compareExactTemporalValues(piece.target.end, item.duration) === 0 ? piece : undefined;
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
    case "timeline.retime": {
      const { item } = selection([edit.item])[0]!;
      const piece = nleRetimeWindow(item);
      if (piece === undefined) throw new Error(`NLE Item ${item.id} retime requires one affine source window on a Picture-only Media or Composition Present.`);
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

export function allocateTimelinePlacement(context: ActiveTimeline, textItems: ReadonlySet<string>, input: {
  readonly medium: NleTrack["kind"];
  readonly role?: NleTrack["role"];
  readonly track: string | undefined;
  readonly purpose:
    | { readonly kind: "present"; readonly start: ExactTemporalValue; readonly duration: ExactTemporalValue }
    | { readonly kind: "adjust" };
}) {
  const { project, composition, view } = context;
  const { medium, purpose } = input;
  const role = input.role ?? (purpose.kind === "adjust" ? "effect" : undefined);
  const tracks = composition.tracks.filter(track => track.kind === medium);
  const trackRole = (track: NleTrack) => studioTrackRole(track, textItems);
  const locked = (track: NleTrack) => nleViewTrackLocked(view, composition.id, track.id);
  const available = (track: NleTrack) => track.enabled && !locked(track);
  let selected: NleTrack | undefined;
  if (input.track !== undefined) {
    selected = tracks.find(track => track.id === input.track);
    if (selected === undefined) throw new Error(`NLE Studio placement requires a ${medium} Track in ${composition.id}.`);
    const selectedRole = trackRole(selected);
    if (selectedRole !== role && !(purpose.kind === "adjust" && selectedRole === undefined)) {
      throw new Error("NLE Studio placement requires a compatible Track role.");
    }
    if (locked(selected)) throw new Error(`NLE Studio placement Track ${input.track} is locked.`);
  } else if (purpose.kind === "adjust") {
    const last = tracks.at(-1);
    if (last && trackRole(last) === role && available(last)) selected = last;
  } else if (medium === "audio") {
    selected = tracks.find(track => trackRole(track) === role && available(track));
  } else {
    const end = addExactTemporalValues(purpose.start, purpose.duration);
    selected = tracks.reverse().find(track => trackRole(track) === role && available(track) && track.items.every(item =>
      item.kind === "present" && (
        compareExactTemporalValues(end, item.start) <= 0 || compareExactTemporalValues(nleItemEnd(item), purpose.start) <= 0
      )));
  }
  if (selected !== undefined) return { project, track: selected.id, commands: [] as readonly NleCommand[] };
  const track = makeTrack(medium, role);
  const commands: readonly NleCommand[] = [{ kind: "track.add", composition: composition.id, track }];
  return { project: applyNleTransaction(project, { commands }), track: track.id, commands };
}

function makeTrack(kind: NleTrack["kind"], role?: NleTrack["role"]): NleTrack {
  const name = role === "subtitle" ? "字幕轨道" : role === "text" ? "文字轨道" : role === "effect" ? "效果轨道"
    : kind === "picture" ? "视频轨道" : "音频轨道";
  return { id: `track-${randomUUID()}`, name, kind, ...(role === undefined ? {} : { role }), enabled: true, items: [] };
}

type TrackArrangement = {
  readonly commands: readonly NleCommand[];
  readonly trackOrder?: readonly string[];
};

function preferredTrackOrder(composition: NleComposition, view: NleView, rows: readonly NleTrack[]) {
  const firstAudio = rows.findIndex(track => track.kind === "audio");
  const mixed = firstAudio >= 0 && rows.slice(firstAudio + 1).some(track => track.kind === "picture");
  return mixed || nleViewCompositionState(view, composition.id)?.trackOrder !== undefined
    ? { trackOrder: rows.map(track => track.id) } : {};
}

function planTrackArrangement(composition: NleComposition, view: NleView, rows: readonly NleTrack[],
  block: readonly NleTrack[], gap: number): TrackArrangement {
  const moved = new Set(block);
  const ordered = rows.filter(track => !moved.has(track));
  const index = rows.slice(0, gap).filter(track => !moved.has(track)).length;
  ordered.splice(index, 0, ...block);
  if (ordered.every((track, index) => track === rows[index])) return { commands: [] };

  const commands: NleCommand[] = [];
  for (const kind of ["picture", "audio"] as const) {
    const previous = rows.filter(track => track.kind === kind);
    const next = ordered.filter(track => track.kind === kind);
    if (next.every((track, index) => track === previous[index])) continue;
    if (kind === "picture") next.reverse();
    for (let index = next.length - 1; index >= 0; index--) {
      const track = next[index]!;
      if (!moved.has(track)) continue;
      const before = next[index + 1]?.id;
      commands.push({ kind: "track.move", id: track.id, ...(before === undefined ? {} : { before }) });
    }
  }
  return { commands, ...preferredTrackOrder(composition, view, ordered) };
}

export function planTimelineTrackReorder(composition: NleComposition, view: NleView, track: string,
  before: string | undefined): TrackArrangement {
  const rows = orderNleTimelineTracks(composition.tracks, nleViewCompositionState(view, composition.id)?.trackOrder);
  const moved = rows.find(row => row.id === track);
  if (moved === undefined) throw new Error(`NLE Studio cannot reorder unknown Track ${track}.`);
  if (nleViewTrackLocked(view, composition.id, track)) throw new Error(`NLE Studio cannot reorder locked Track ${track}.`);
  const target = before === undefined ? rows.length : rows.findIndex(row => row.id === before);
  if (target < 0) throw new Error(`NLE Studio reorder targets unknown Track ${before}.`);
  return planTrackArrangement(composition, view, rows, [moved], target);
}

/** Studio Timeline allocation policy over current Project and View facts. */
export function planTimelineDrop(context: ActiveTimeline, textItems: ReadonlySet<string>, drop: NleStudioTimelineDrop): TrackArrangement & {
  readonly anchorTrack: string;
  readonly destination: NleStudioDropDestination;
} {
  const { composition, view } = context;
  const rows = [...orderNleTimelineTracks(composition.tracks, nleViewCompositionState(view, composition.id)?.trackOrder)];
  const ids = relatedItems(composition, view, drop.items);
  const entries = rows.flatMap(track => track.items.filter(item => ids.has(item.id)).map(item => ({ track, item })));
  if (!drop.items.includes(drop.anchor) || entries.length !== ids.size) {
    throw new Error("NLE Studio drop requires an anchor and selected Items in the active Composition.");
  }
  const anchorTrack = entries.find(entry => entry.item.id === drop.anchor)!.track;
  const trackRole = (track: NleTrack) => studioTrackRole(track, textItems);
  const itemRole = (track: NleTrack, id: string) => {
    if (textItems.has(id)) return "text";
    const role = trackRole(track);
    return role === "text" ? undefined : role;
  };
  const anchorRole = itemRole(anchorTrack, drop.anchor);
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
  const changesTime = compareExactTemporalValues(delta, zero) !== 0;
  const currentTrack = { track: anchorTrack.id };
  const commands: NleCommand[] = [];
  if (drop.target.kind === "gap") {
    const selectedTracks = new Set(entries.map(({ track }) => track));
    const block = rows.filter(track => selectedTracks.has(track));
    const first = rows.indexOf(block[0]!);
    const end = first + block.length;
    if (rows[end - 1] === block.at(-1) && block.every(track => track.items.every(item => ids.has(item.id)))) {
      const arrangement = planTrackArrangement(composition, view, rows, block, target);
      const reordered = arrangement.commands.length > 0 || arrangement.trackOrder !== undefined;
      let destination: NleStudioDropDestination = currentTrack;
      if (reordered) {
        const before = rows[target]?.id;
        destination = { gap: true, ...(before === undefined ? {} : { before }) };
      }
      commands.push(...arrangement.commands);
      if (changesTime) commands.push({ kind: "item.move", ids: [...ids], delta });
      return { ...arrangement, commands, anchorTrack: anchorTrack.id, destination };
    }
  } else {
    const lane = rows[target]!;
    if (lane.kind !== anchorTrack.kind || trackRole(lane) !== anchorRole || locked(lane)
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
  for (const members of membersByTrack.values()) {
    if (members.some(item => textItems.has(item.id)) && !members.every(item => textItems.has(item.id))) {
      return { commands, anchorTrack: anchorTrack.id, destination: currentTrack };
    }
  }

  const placeLane = (source: NleTrack, desired: number, minimum: number, maximum: number, forceNew = false) => {
    const members = membersByTrack.get(source)!;
    const role = itemRole(source, members[0]!.id);
    const candidates = rows.map((track, index) => ({ track, index }))
      .filter(({ track, index }) => index >= minimum && index < maximum
        && track.kind === source.kind && trackRole(track) === role && !locked(track)
        && track.items.every(other => ids.has(other.id)
          || members.every(item => !overlapsAfterMove(item, other, delta))))
      .sort((left, right) => Math.abs(left.index - desired) - Math.abs(right.index - desired));
    let destination = forceNew ? undefined : candidates[0]?.track;
    if (destination === undefined) {
      const index = Math.max(minimum, Math.min(maximum, desired));
      const neighbor = source.kind === "picture" ? rows.slice(0, index).findLast(track => track.kind === source.kind)
        : rows.slice(index).find(track => track.kind === source.kind);
      const before = neighbor?.id;
      destination = makeTrack(source.kind, role);
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
  const arrangement = rows.length === sourceRows.length ? {} : preferredTrackOrder(composition, view, rows);
  if (sourceRows.includes(anchor)) return { ...arrangement, commands, anchorTrack: anchor.id, destination: { track: anchor.id } };
  const before = rows.slice(rows.indexOf(anchor) + 1).find(track => sourceRows.includes(track))?.id;
  return { ...arrangement, commands, anchorTrack: anchor.id, destination: { gap: true, ...(before === undefined ? {} : { before }) } };
}

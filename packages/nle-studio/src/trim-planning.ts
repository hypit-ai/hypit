import {
  applyNleTransaction,
  indexNleComposition,
  nleCompositionDuration,
  nleItemEnd,
  nleLinearTimeMapping,
  sliceNleProcessTime,
  sliceNleTimeMapping,
  type NleCommand,
  type NleComposition,
  type NleItem,
  type NleProject,
  type NleSourceTimeBounds,
  type NleTrack,
} from "@hypit/nle";
import {
  addExactTemporalValues,
  assertTemporalMapPieces,
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalZero,
  sealLocalTemporalDomain,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalRate,
} from "@hypit/temporal/algebra";
import { studioFrameTime } from "./timeline-time.js";
import type { NleStudioTrimRange } from "./protocol.js";

type TrimEdge = "start" | "end";
const compare = compareExactTemporalValues;

function transitionOwnsEdge(composition: NleComposition, item: NleItem, edge: TrimEdge): boolean {
  return composition.transitions.some(value => (edge === "start" ? value.incoming : value.outgoing) === item.id);
}

/** First occupied time outward from each edge, using exact half-open Item windows. */
export function trimTrackNeighborLimits(track: NleTrack) {
  const windows = track.items.map(item => ({
    id: item.id, start: item.start, end: nleItemEnd(item), limits: {} as Partial<Record<TrimEdge, ExactTemporalValue>>,
  }));
  const sweep = (edge: TrimEdge, opposite: TrimEdge, direction: 1 | -1) => {
    const ordered = windows.toSorted((left, right) => direction * compare(left[edge], right[edge]));
    let at: ExactTemporalValue | undefined;
    let priorLimit: ExactTemporalValue | undefined;
    let runningLimit: ExactTemporalValue | undefined;
    for (const window of ordered) {
      const current = window[edge];
      if (at === undefined || compare(at, current) !== 0) {
        at = current;
        // Use only intervals whose corresponding edge lies strictly on the outward side.
        priorLimit = runningLimit;
      }
      if (priorLimit !== undefined) {
        window.limits[edge] = direction * compare(priorLimit, current) > 0 ? current : priorLimit;
      }
      const otherEdge = window[opposite];
      if (runningLimit === undefined || direction * compare(otherEdge, runningLimit) > 0) runningLimit = otherEdge;
    }
  };
  sweep("start", "end", 1);
  sweep("end", "start", -1);
  return new Map(windows.map(({ id, limits }) => [id, limits]));
}

export function assertOrdinaryTrim(composition: NleComposition, track: NleTrack, item: NleItem, edge: TrimEdge,
  at: ExactTemporalValue, neighbor: ExactTemporalValue | undefined): void {
  if (transitionOwnsEdge(composition, item, edge)) {
    throw new Error(`NLE Item ${item.id} ${edge} edge is controlled by its Transition.`);
  }
  if (neighbor !== undefined && (edge === "start" ? compare(at, neighbor) < 0 : compare(at, neighbor) > 0)) {
    throw new Error(`NLE Item ${item.id} ${edge} edge reaches another Item on Track ${track.id}.`);
  }
}

export function prepareOrdinaryTrims(
  project: NleProject, composition: NleComposition, lockedTracks: ReadonlySet<string>,
  trims: readonly Extract<NleCommand, { kind: "item.trim" }>[],
  sourceForItem: (item: NleItem) => NleSourceTimeBounds | undefined = () => undefined,
): NleCommand[] {
  const index = indexNleComposition(composition);
  const neighborsByTrack = new Map<string, ReturnType<typeof trimTrackNeighborLimits>>();
  return trims.flatMap(({ id, edge, at }) => {
    const { item, track } = index.item(id)!;
    if (lockedTracks.has(track.id)) throw new Error(`NLE Studio Track ${track.name} is locked.`);
    const neighbors = neighborsByTrack.get(track.id) ?? trimTrackNeighborLimits(track);
    neighborsByTrack.set(track.id, neighbors);
    assertOrdinaryTrim(composition, track, item, edge, at, neighbors.get(id)?.[edge]);
    const prepare = planTrimEdge(item, edge, at, project.editRate, sourceForItem(item));
    return prepare === undefined ? [] : [prepare];
  });
}

/** Validate one edge's window and supply any source preparation for the atomic edit. */
export function planTrimEdge(
  item: NleItem, edge: TrimEdge, at: ExactTemporalValue, rate: TemporalRate, source: NleSourceTimeBounds | undefined,
): NleCommand | undefined {
  const zero = exactTemporalZero();
  const offset = subtractExactTemporalValues(at, item.start);
  const range = edge === "start" ? { start: offset, end: item.duration } : { start: zero, end: offset };
  const duration = subtractExactTemporalValues(range.end, range.start);
  if (compare(at, zero) < 0 || compare(duration, studioFrameTime(1, rate)) < 0) {
    throw new Error(`NLE Item ${item.id} trim must keep at least one edit frame inside Programme time.`);
  }
  const expands = compare(range.start, zero) < 0 || compare(range.end, item.duration) > 0;
  if (item.kind === "adjust") {
    sliceNleTimeMapping(item.controlTime, item.duration, range);
    return;
  }
  if (expands && source === undefined) throw new Error(`NLE Item ${item.id} requires readable source bounds to extend.`);
  const constantTime = expands && source?.kind === "constant"
    ? nleLinearTimeMapping(item.duration, zero, { numerator: 0, denominator: 1 }) : undefined;
  const mapping = sliceNleTimeMapping(constantTime ?? item.sourceTime, item.duration, range);
  if (expands && source?.kind === "timed" && source.duration !== undefined) {
    assertTemporalMapPieces(mapping.pieces,
      sealLocalTemporalDomain({ id: `${item.id}:trim`, duration }),
      sealLocalTemporalDomain({ id: `${item.id}:source`, duration: source.duration }));
  }
  for (const process of [...item.picture?.processes ?? [], ...item.audio?.processes ?? []]) {
    sliceNleProcessTime(process.controlTime, item.duration, range);
  }
  if (constantTime !== undefined) return { kind: "item.retime", id: item.id, time: constantTime };
}

function editFrame(value: ExactTemporalValue, rate: TemporalRate, ceil: boolean): number {
  const { numerator, denominator } = exactTemporalRational(value);
  const n = numerator * BigInt(rate.numerator);
  const d = denominator * BigInt(rate.denominator);
  const rem = n % d;
  return Number(n / d + (ceil && rem > 0n ? 1n : !ceil && rem < 0n ? -1n : 0n));
}

function farthestFrame(anchor: number, limit: number, accepts: (frame: number) => boolean): number {
  if (anchor === limit || accepts(limit)) return limit;
  const direction = Math.sign(limit - anchor);
  const extent = Math.abs(limit - anchor);
  let accepted = 0;
  let rejected = 1;
  while (rejected < extent && accepts(anchor + direction * rejected)) {
    accepted = rejected;
    rejected = Math.min(extent, rejected * 2);
  }
  while (rejected - accepted > 1) {
    const middle = accepted + Math.floor((rejected - accepted) / 2);
    if (accepts(anchor + direction * middle)) accepted = middle;
    else rejected = middle;
  }
  return anchor + direction * accepted;
}

/** Project the connected legal range around the current edge onto Studio's edit-frame grid. */
export function projectTrimRange(
  project: NleProject, composition: NleComposition, item: NleItem, edge: TrimEdge, rate: TemporalRate,
  source: NleSourceTimeBounds | undefined, neighbor: ExactTemporalValue | undefined,
): NleStudioTrimRange | undefined {
  if (transitionOwnsEdge(composition, item, edge)) return;
  const end = nleItemEnd(item);
  const oneFrame = studioFrameTime(1, rate);
  const minimum = edge === "start" ? editFrame(neighbor ?? exactTemporalZero(), rate, true)
    : editFrame(addExactTemporalValues(item.start, oneFrame), rate, true);
  const maximum = edge === "end" ? (neighbor === undefined ? Number.MAX_SAFE_INTEGER : editFrame(neighbor, rate, false))
    : editFrame(subtractExactTemporalValues(end, oneFrame), rate, false);
  if (maximum < minimum || !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) return;
  const current = edge === "start" ? item.start : end;
  const related = composition.transitions.some(value => value.outgoing === item.id || value.incoming === item.id)
    || composition.mattes.some(value => value.content === item.id || value.matte === item.id)
    || (edge === "end" && compare(end, nleCompositionDuration(composition)) === 0
      && project.compositions.some(value => value.tracks.some(track => track.items.some(candidate =>
        candidate.kind === "present" && candidate.source === "composition" && candidate.composition === composition.id))));
  const accepts = (frame: number): boolean => {
    try {
      const at = studioFrameTime(frame, rate);
      if (compare(at, current) === 0) return true;
      const prepare = planTrimEdge(item, edge, at, rate, source);
      if (related) applyNleTransaction(project, { commands: [
        ...(prepare === undefined ? [] : [prepare]), { kind: "item.trim", id: item.id, edge, at },
      ] });
      return true;
    } catch {
      return false;
    }
  };
  const before = Math.min(maximum, editFrame(current, rate, false));
  const after = Math.max(minimum, editFrame(current, rate, true));
  const left = before >= minimum && accepts(before) ? farthestFrame(before, minimum, accepts) : undefined;
  const right = after <= maximum && accepts(after) ? farthestFrame(after, maximum, accepts) : undefined;
  if (left === undefined && right === undefined) return;
  const range = { minimum: left ?? after, maximum: right ?? before };
  if (range.minimum === range.maximum && compare(studioFrameTime(range.minimum, rate), current) === 0) return;
  return range;
}

import { compareExactTemporalValues } from "@hypit/temporal/algebra";
import { nleItemEnd } from "../project.js";
import type { NleTrack } from "../types.js";

/** Nearest intersecting Items in the authored order, bounded by Transition participants. */
export function nleTrackStackingNeighbors(track: NleTrack, transitionItems: ReadonlySet<string>):
  ReadonlyMap<string, { readonly up?: string; readonly down?: string }> {
  let segment = 0;
  const byTime = track.items.flatMap((item, index) => {
    if (transitionItems.has(item.id)) {
      segment += 1;
      return [];
    }
    return [{ item, index, segment, end: nleItemEnd(item) }];
  }).sort((left, right) => left.segment - right.segment || compareExactTemporalValues(left.item.start, right.item.start));
  const neighbors = new Map<number, { up?: number; down?: number }>();
  let active: typeof byTime = [];
  for (const current of byTime) {
    active = active.filter(other => other.segment === current.segment && compareExactTemporalValues(other.end, current.item.start) > 0);
    for (const other of active) {
      const below = Math.min(other.index, current.index);
      const above = Math.max(other.index, current.index);
      const lower = neighbors.get(below) ?? {};
      const upper = neighbors.get(above) ?? {};
      lower.up = Math.min(lower.up ?? above, above);
      upper.down = Math.max(upper.down ?? below, below);
      neighbors.set(below, lower);
      neighbors.set(above, upper);
    }
    active.push(current);
  }
  return new Map(Array.from(neighbors, ([index, { up, down }]) => [track.items[index]!.id, {
    ...(up === undefined ? {} : { up: track.items[up]!.id }),
    ...(down === undefined ? {} : { down: track.items[down]!.id }),
  }]));
}

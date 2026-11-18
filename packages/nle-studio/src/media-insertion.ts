import { nleItemEnd, type NleCommand, type NleComposition, type NleTrack } from "@hypit/nle";
import type { NleEditGroup } from "@hypit/nle/view";
import {
  addExactTemporalValues as add,
  compareExactTemporalValues as compare,
  exactTemporalZero,
  subtractExactTemporalValues as subtract,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

function overlap(leftStart: ExactTemporalValue, leftEnd: ExactTemporalValue, rightStart: ExactTemporalValue, rightEnd: ExactTemporalValue) {
  const start = compare(leftStart, rightStart) >= 0 ? leftStart : rightStart;
  const end = compare(leftEnd, rightEnd) <= 0 ? leftEnd : rightEnd;
  return compare(end, start) > 0 ? subtract(end, start) : exactTemporalZero();
}

export function planMediaInsertion(
  composition: NleComposition, track: NleTrack, groups: readonly NleEditGroup[],
  at: ExactTemporalValue, duration: ExactTemporalValue,
): { readonly start: ExactTemporalValue; readonly move?: NleCommand } {
  let start = at;
  for (const item of track.items) {
    if (compare(item.start, at) <= 0 && compare(at, nleItemEnd(item)) < 0 && compare(item.start, start) < 0) start = item.start;
  }
  const moving = new Set(track.items.filter(item => compare(item.start, start) >= 0).map(item => item.id));
  const available = new Set(composition.tracks.flatMap(lane => lane.items.map(item => item.id)));
  const linked = [...groups.map(group => group.items), ...composition.transitions.map(({ outgoing, incoming }) => [outgoing, incoming])];
  for (let size = -1; size !== moving.size;) {
    size = moving.size;
    for (const members of linked) if (members.some(id => moving.has(id))) {
      for (const id of members) if (available.has(id)) moving.add(id);
    }
  }
  if (track.items.some(item => compare(item.start, start) < 0
    && (moving.has(item.id) || compare(nleItemEnd(item), start) > 0))) {
    throw new Error("插入位置跨越了片段、分组或转场，请选择它们之前或之后的切点。");
  }
  for (const lane of composition.tracks) {
    const fixed = lane.items.filter(item => !moving.has(item.id));
    for (const item of lane.items.filter(item => moving.has(item.id))) {
      const end = nleItemEnd(item), shiftedStart = add(item.start, duration), shiftedEnd = add(end, duration);
      if (fixed.some(other => {
        const otherEnd = nleItemEnd(other);
        return compare(overlap(shiftedStart, shiftedEnd, other.start, otherEnd),
          overlap(item.start, end, other.start, otherEnd)) > 0;
      })) throw new Error("插入后，关联轨道上的片段会发生重叠。");
    }
  }
  return { start, ...(moving.size ? { move: { kind: "item.move", ids: [...moving], delta: duration } } : {}) };
}

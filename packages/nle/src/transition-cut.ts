import { compareExactTemporalValues, type ExactTemporalValue } from "@hypit/temporal/algebra";
import { isNlePicturePresent, nleItemEnd } from "./project.js";
import type { NleComposition, NleItem, NleTrack } from "./types.js";

/** Cuts available for creating a Transition on the current Track. */
export function nleDirectTransitionCuts(composition: NleComposition, track: NleTrack): readonly {
  readonly at: ExactTemporalValue;
  readonly outgoing: string;
  readonly incoming: string;
}[] {
  if (track.kind !== "picture") return [];
  const matteSources = new Set(composition.mattes.map(relation => relation.matte));
  const outgoingUsed = new Set(composition.transitions.map(relation => relation.outgoing));
  const incomingUsed = new Set(composition.transitions.map(relation => relation.incoming));
  const edges = track.items.flatMap(item => [
    { at: item.start, edge: "start" as const, item },
    { at: nleItemEnd(item), edge: "end" as const, item },
  ]).sort((left, right) => compareExactTemporalValues(left.at, right.at));
  const cuts: { at: ExactTemporalValue; outgoing: string; incoming: string }[] = [];
  const eligible = (item: NleItem) => isNlePicturePresent(item) && item.enabled && !matteSources.has(item.id);
  let active = 0;
  let index = 0;
  while (index < edges.length) {
    const at = edges[index]!.at;
    const starts: NleItem[] = [];
    const ends: NleItem[] = [];
    do {
      const { edge, item } = edges[index++]!;
      (edge === "start" ? starts : ends).push(item);
    } while (index < edges.length && compareExactTemporalValues(edges[index]!.at, at) === 0);
    active -= ends.length; // Count only Items spanning the cut before the new Items begin.
    const [outgoing] = ends;
    const [incoming] = starts;
    if (active === 0 && ends.length === 1 && starts.length === 1 && outgoing && incoming
      && eligible(outgoing) && eligible(incoming) && !outgoingUsed.has(outgoing.id) && !incomingUsed.has(incoming.id)) {
      cuts.push({ at, outgoing: outgoing.id, incoming: incoming.id });
    }
    active += starts.length;
  }
  return cuts;
}

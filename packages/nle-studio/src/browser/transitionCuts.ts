import { nleItemEnd } from "@hypit/nle";
import { compareExactTemporalValues as compare } from "@hypit/temporal/algebra";
import type { NleStudioSession } from "../protocol.js";
import { activeComposition, frameOf } from "./editPlans.js";

export type TransitionCut = {
  readonly track: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly frame: number;
  readonly overlap?: { readonly id: string; readonly start: number; readonly end: number };
};

export function transitionCuts(session: NleStudioSession): TransitionCut[] {
  const composition = activeComposition(session);
  return composition.tracks.flatMap(track => {
    if (track.kind !== "picture" || session.open.timeline.tracks.find(row => row.id === track.id)?.locked) return [];
    const items = track.items.filter(item => item.kind === "present" && item.enabled);
    return items.flatMap<TransitionCut>(outgoing => {
      const end = nleItemEnd(outgoing), frame = frameOf(session, end);
      const existing = composition.transitions.find(transition => transition.outgoing === outgoing.id);
      if (existing) {
        const incoming = items.find(item => item.id === existing.incoming);
        if (!incoming) return [];
        const start = frameOf(session, incoming.start);
        return [{ track: track.id, outgoing: outgoing.id, incoming: incoming.id, frame: (start + frame) / 2,
          overlap: { id: existing.id, start, end: frame } }];
      }
      const incoming = items.find(item => item.id !== outgoing.id && compare(item.start, end) === 0
        && !composition.transitions.some(transition => transition.incoming === item.id));
      return incoming ? [{ track: track.id, outgoing: outgoing.id, incoming: incoming.id, frame }] : [];
    });
  });
}

export function transitionCutAt(cuts: readonly TransitionCut[], frame: number, track?: string, tolerance = Infinity): TransitionCut | undefined {
  let best: TransitionCut | undefined;
  let distance = tolerance;
  for (const cut of cuts) {
    if (track !== undefined && cut.track !== track) continue;
    const start = cut.overlap?.start ?? cut.frame, end = cut.overlap?.end ?? cut.frame;
    const next = Math.max(start - frame, frame - end, 0);
    if (next <= distance && (best === undefined || next < distance || Math.abs(cut.frame - frame) < Math.abs(best.frame - frame))) {
      best = cut;
      distance = next;
    }
  }
  return best;
}

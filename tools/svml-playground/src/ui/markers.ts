import type { PlaygroundSnapshot, Range } from "../shared.js";

/** How many distinct depth tones the stylesheet defines. */
export const MARKER_TONES = 4;

/**
 * A tone per Script marker, shared by the code pane, the timeline and the box
 * drawn over the picture.
 *
 * Markers are coloured by **nesting depth**, not by identity. Depth is the only
 * difference between two Selections that means anything — an inner one is a
 * narrower claim about the same speech — so two markers at the same depth read
 * the same, and an inner pair reads as sitting inside its outer pair rather than
 * as an unrelated thing.
 *
 * The three panes have to agree, or the colour would carry no meaning: a marker
 * pair in the prose and the clip it binds are the same fact seen twice.
 */
export function markerTones(snapshot: PlaygroundSnapshot): ReadonlyMap<string, number> {
  const tones = new Map<string, number>();
  for (const segment of snapshot.script?.segments ?? []) {
    tones.set(segment.id, segment.depth % MARKER_TONES);
  }
  for (const selection of snapshot.script?.selections ?? []) {
    tones.set(selection.id, selection.depth % MARKER_TONES);
  }
  // A Moment marks an instant, so it sits at whatever level it was written in
  // rather than enclosing anything. One level in from its Segment is honest.
  for (const moment of snapshot.script?.moments ?? []) tones.set(moment.id, 1 % MARKER_TONES);
  return tones;
}

/**
 * The Script ranges whose speech the playhead is inside, outermost first.
 *
 * Segments and Selections alike, because a Segment is a level too: `<price>`
 * encloses `@bags`, so drawing only the Selection would show a nesting with its
 * outermost level missing.
 *
 * Derived from the Script tokens each range encloses rather than from the clips
 * bound to it, because a range is a claim about speech whether or not anything
 * was placed on it. `@amount` inside `@fee` is still inside `@fee` even when
 * only the outer one drives a Media Item.
 */
export type ScriptSpan = {
  readonly id: string;
  readonly depth: number;
  readonly range: Range;
  readonly startFrame: number;
  readonly endFrame: number;
};

/** Every Segment and Selection, placed on the timeline by the tokens it holds. */
export function scriptSpans(snapshot: PlaygroundSnapshot): readonly ScriptSpan[] {
  const tokens = snapshot.script?.tokens ?? [];
  const placed: ScriptSpan[] = [];
  const spans = [
    ...(snapshot.script?.segments ?? []).map((segment) => ({
      id: segment.id, depth: segment.depth, range: segment.range,
    })),
    ...(snapshot.script?.selections ?? []).flatMap((selection) =>
      selection.occurrences.map((occurrence) => ({
        id: selection.id,
        depth: selection.depth,
        range: { start: occurrence.open.start, end: occurrence.close.end },
      }))),
  ];
  for (const { id, depth, range } of spans) {
    const within = tokens.filter((token) =>
      token.range.start >= range.start && token.range.end <= range.end);
    if (within.length === 0) continue;
    placed.push({
      id, depth, range,
      startFrame: Math.min(...within.map((token) => token.startFrame)),
      endFrame: Math.max(...within.map((token) => token.endFrame)),
    });
  }
  return placed;
}

export function liveRanges(snapshot: PlaygroundSnapshot, frame: number): readonly ScriptSpan[] {
  // Outermost first: an inner outline is drawn last and sits inside its parent.
  return scriptSpans(snapshot)
    .filter((span) => frame >= span.startFrame && frame < span.endFrame)
    .sort((left, right) => left.depth - right.depth);
}

/**
 * The tightest Script range written around a source offset.
 *
 * Clicking marked prose should land inside the thing that was clicked, and the
 * innermost marker is the most specific claim there. Resolving to a clip alone
 * would send a click on `@amount` to whatever encloses it, because a marker that
 * places nothing still means something.
 */
export function spanAtOffset(snapshot: PlaygroundSnapshot, offset: number): ScriptSpan | undefined {
  return scriptSpans(snapshot)
    .filter((span) => offset >= span.range.start && offset <= span.range.end)
    .sort((left, right) =>
      (left.range.end - left.range.start) - (right.range.end - right.range.start))[0];
}

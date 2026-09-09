import type { Clip, StudioSnapshot } from "../shared.js";

/**
 * Which pane the user acted in. Panes ignore events they originated, which is
 * the only thing keeping timeline, code and picture from driving each other in
 * a loop.
 */
export type Origin = "timeline" | "code" | "video";

export type Selection =
  | { readonly kind: "none" }
  | { readonly kind: "clip"; readonly clipId: string; readonly origin: Origin }
  | { readonly kind: "semantic-segment"; readonly segmentId: string; readonly origin: Origin }
  | { readonly kind: "semantic-selection"; readonly selectionId: string; readonly origin: Origin }
  | { readonly kind: "semantic-moment"; readonly momentId: string; readonly origin: Origin };

export type Playhead = { readonly frame: number; readonly origin: Origin | "play" };

export type State = {
  readonly snapshot: StudioSnapshot;
  readonly selection: Selection;
  readonly playhead: Playhead;
};

export type Store = {
  /** Undefined until the first snapshot arrives. */
  current(): State | undefined;
  clip(clipId: string): Clip | undefined;
  /** Clips covering a frame, topmost track first. */
  clipsAt(frame: number): readonly Clip[];
  load(snapshot: StudioSnapshot): void;
  /** Select without moving the playhead; timeline inspection must not destroy position. */
  select(clipId: string, origin: Origin): void;
  /** Select one authored SemanticTake without moving the playhead. */
  selectSemanticSegment(segmentId: string, origin: Origin): void;
  /** Select one authored Selection marker without moving the playhead. */
  selectSemanticSelection(selectionId: string, origin: Origin): void;
  /** Select one authored Moment marker without moving the playhead. */
  selectSemanticMoment(momentId: string, origin: Origin): void;
  /** Select and seek to the clip start, used by source navigation. */
  selectClip(clipId: string, origin: Origin): void;
  /**
   * Look at one instant, optionally selecting a clip there. Used when the thing
   * an author pointed at is a Script range rather than a clip, which has no
   * first frame of its own to jump to.
   */
  focus(frame: number, clipId: string | undefined, origin: Origin): void;
  clearSelection(): void;
  seek(frame: number, origin: Origin | "play"): void;
  subscribe(listener: (state: State) => void): void;
};

/**
 * The clip an author is pointing at in the source text.
 *
 * A Script intent wins over the element that binds it: `@claim … @/claim` sits
 * inside the `<script>` element, so without that preference every click in the
 * prose would select the Speech Take instead of the B-roll. Ties break toward
 * the tightest range, which is the most specific thing under the cursor.
 */
export function clipAtOffset(snapshot: StudioSnapshot, offset: number): Clip | undefined {
  const clips = snapshot.tracks.flatMap((track) => track.clips);
  const within = (range: { readonly start: number; readonly end: number } | undefined): number =>
    range === undefined || offset < range.start || offset > range.end
      ? Number.POSITIVE_INFINITY
      : range.end - range.start;

  let best: Clip | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const clip of clips) {
    const score = within(clip.elementRange);
    if (score < bestScore) {
      bestScore = score;
      best = clip;
    }
  }
  return best;
}

export function createStore(): Store {
  let snapshot: StudioSnapshot | undefined;
  let selection: Selection = { kind: "none" };
  let playhead: Playhead = { frame: 0, origin: "timeline" };
  const listeners: ((state: State) => void)[] = [];

  const clips = (): readonly Clip[] => snapshot?.tracks.flatMap((track) => track.clips) ?? [];

  const emit = (): void => {
    if (snapshot === undefined) return;
    const state: State = { snapshot, selection, playhead };
    for (const listener of listeners) listener(state);
  };

  const clamp = (frame: number): number =>
    Math.max(0, Math.min(Math.round(frame), (snapshot?.space.frameCount ?? 1) - 1));

  return {
    current: () => snapshot === undefined ? undefined : { snapshot, selection, playhead },
    clip: (clipId) => clips().find((clip) => clip.id === clipId),
    clipsAt(frame) {
      return clips()
        .filter((clip) => frame >= clip.startFrame && frame < clip.endFrameExclusive)
        .sort((left, right) => right.stackOrder - left.stackOrder);
    },
    load(value) {
      snapshot = value;
      // A recompiled Source may have dropped the selected clip, and its frame
      // count may have moved under the playhead.
      const held = selection;
      if (held.kind === "clip" && !clips().some((clip) => clip.id === held.clipId)) {
        selection = { kind: "none" };
      }
      if (held.kind === "semantic-segment"
        && !snapshot.semantic?.segments.some((segment) => segment.id === held.segmentId)) {
        selection = { kind: "none" };
      }
      if (held.kind === "semantic-selection"
        && !snapshot.semantic?.selections.some((item) => item.id === held.selectionId)) {
        selection = { kind: "none" };
      }
      if (held.kind === "semantic-moment"
        && !snapshot.semantic?.moments.some((item) => item.id === held.momentId)) {
        selection = { kind: "none" };
      }
      playhead = { frame: clamp(playhead.frame), origin: playhead.origin };
      emit();
    },
    select(clipId, origin) {
      const clip = clips().find((item) => item.id === clipId);
      if (clip === undefined) return;
      selection = { kind: "clip", clipId, origin };
      emit();
    },
    selectSemanticSegment(segmentId, origin) {
      if (snapshot?.semantic?.segments.some((segment) => segment.id === segmentId) !== true) return;
      selection = { kind: "semantic-segment", segmentId, origin };
      emit();
    },
    selectSemanticSelection(selectionId, origin) {
      if (snapshot?.semantic?.selections.some((item) => item.id === selectionId) !== true) return;
      selection = { kind: "semantic-selection", selectionId, origin };
      emit();
    },
    selectSemanticMoment(momentId, origin) {
      if (snapshot?.semantic?.moments.some((item) => item.id === momentId) !== true) return;
      selection = { kind: "semantic-moment", momentId, origin };
      emit();
    },
    selectClip(clipId, origin) {
      const clip = clips().find((item) => item.id === clipId);
      if (clip === undefined) return;
      selection = { kind: "clip", clipId, origin };
      playhead = { frame: clamp(clip.startFrame), origin };
      emit();
    },
    focus(frame, clipId, origin) {
      const clip = clipId === undefined ? undefined : clips().find((item) => item.id === clipId);
      selection = clip === undefined ? { kind: "none" } : { kind: "clip", clipId: clip.id, origin };
      playhead = { frame: clamp(frame), origin };
      emit();
    },
    clearSelection() {
      if (selection.kind === "none") return;
      selection = { kind: "none" };
      emit();
    },
    seek(frame, origin) {
      const next = clamp(frame);
      if (next === playhead.frame && origin === playhead.origin) return;
      playhead = { frame: next, origin };
      emit();
    },
    subscribe(listener) {
      listeners.push(listener);
      if (snapshot !== undefined) listener({ snapshot, selection, playhead });
    },
  };
}

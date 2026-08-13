/**
 * Turn a built programme into what the panels read.
 *
 * A timeline is the Presents of every Track, and a Present carries a span, an
 * identity and a stacking order - the whole contract, for every package. So the
 * timeline is assembled without knowing what made any of it, and a package that
 * grows a new Track shows up without this file changing.
 */
import type { Clip, PlaygroundSnapshot, Range, ScriptMap, Track } from "../shared.js";
import type { Placement } from "./observe.js";
import type { Preview } from "./preview.js";

type Present = {
  readonly id: string;
  readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly stacking: { readonly order: number };
};

/** Sound is placed in samples rather than frames, in the canonical 48 kHz. */
const SAMPLE_RATE = 48_000;

type AudioClip = {
  readonly id: string;
  readonly target: { readonly startSample: number; readonly endSampleExclusive: number };
};

/**
 * Both kinds of Track say the same thing in their own domain: a named span.
 * Reading them into one shape is what lets the timeline hold both without
 * knowing which package made either.
 */
function spans(
  track: unknown,
  frameRate: { readonly numerator: number; readonly denominator: number },
): readonly { id: string; startFrame: number; endFrameExclusive: number; stackOrder: number }[] {
  const held = track as { presents?: readonly Present[]; clips?: readonly AudioClip[] } | undefined;
  if (held?.presents !== undefined) {
    return held.presents.map((present) => ({
      id: present.id,
      startFrame: present.span.startFrame,
      endFrameExclusive: present.span.endFrameExclusive,
      stackOrder: present.stacking.order,
    }));
  }
  const perSecond = frameRate.numerator / frameRate.denominator;
  return (held?.clips ?? []).map((clip) => ({
    id: clip.id,
    startFrame: Math.floor(clip.target.startSample / SAMPLE_RATE * perSecond),
    endFrameExclusive: Math.max(
      Math.floor(clip.target.startSample / SAMPLE_RATE * perSecond) + 1,
      Math.ceil(clip.target.endSampleExclusive / SAMPLE_RATE * perSecond),
    ),
    // Sound is under every picture, so it sits at the bottom of the timeline.
    stackOrder: Number.MIN_SAFE_INTEGER,
  }));
}

/** Where an authored id was written, whatever kind of thing it names. */
type Located = { readonly id: string; readonly range: Range };

function authored(placements: readonly Placement[]): readonly Located[] {
  const found: Located[] = [];
  for (const placement of placements) {
    if (placement.id !== undefined) found.push({ id: placement.id, range: placement.range });
    for (const child of placement.children) {
      if (child.id !== undefined) found.push({ id: child.id, range: child.range });
    }
  }
  // Longest first, so `handsome-1` wins over `handsome`.
  return found.sort((left, right) => right.id.length - left.id.length);
}

/**
 * A Present is named after the things that produced it, so the authored id it
 * mentions is the tag to point at. Matching on whole delimited parts keeps
 * `bags` from matching inside `bagsful`.
 */
function locate(presentId: string, located: readonly Located[]): Located | undefined {
  const parts = new Set(presentId.split(/[:#+]/u).filter(Boolean));
  return located.find((item) => parts.has(item.id));
}

function scriptMap(
  maps: readonly Record<string, unknown>[],
  built: Preview,
): ScriptMap | undefined {
  const found = maps.find((map) => map.format === "svml.script-source-map@1");
  if (found === undefined) return undefined;
  const selections = (found.selections ?? []) as ScriptMap["selections"];
  const segments = (found.segments ?? []) as ScriptMap["segments"];
  const moments = (found.moments ?? []) as ScriptMap["moments"];
  return {
    recordId: String(found.record ?? ""),
    range: (found.range ?? { start: 0, end: 0 }) as Range,
    // A Segment is the outermost range a Script declares; a Selection written
    // inside one is a level down, and one inside that another.
    segments: segments.map((segment) => ({ ...segment, depth: 0 })),
    selections: selections.map((selection) => ({
      ...selection,
      depth: depthOf(selection, selections),
    })),
    moments,
    // A Script says where a word is written; the timings say when it is said.
    tokens: ((found.tokens ?? []) as readonly { id: string; range: Range }[]).flatMap((token) => {
      const placed = built.tokens.find((item) => item.id === token.id);
      const startFrame = placed === undefined ? undefined : built.anchors.get(placed.startAnchorId);
      const endFrame = placed === undefined ? undefined : built.anchors.get(placed.endAnchorId);
      if (startFrame === undefined || endFrame === undefined) return [];
      return [{ id: token.id, range: token.range, startFrame, endFrame }];
    }),
  };
}

function depthOf(
  selection: ScriptMap["selections"][number],
  all: readonly ScriptMap["selections"][number][],
): number {
  const own = selection.occurrences[0];
  if (own === undefined) return 1;
  let depth = 1;
  for (const other of all) {
    if (other.id === selection.id) continue;
    for (const occurrence of other.occurrences) {
      if (occurrence.open.start < own.open.start && occurrence.close.end > own.close.end) depth += 1;
    }
  }
  return depth;
}

export function snapshot(built: Preview, input: {
  readonly revision: number;
  readonly path: string;
  readonly text: string;
  readonly digest: string;
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly preview: PlaygroundSnapshot["preview"];
}): PlaygroundSnapshot {
  const located = authored(built.source.observations.placements);
  const placeholders = new Set(built.placeholders);

  const tracks: Track[] = [];
  for (const item of built.tracks) {
    const clips: Clip[] = spans(item.track, input.frameRate).map((span) => {
      const where = locate(span.id, located);
      return {
        id: span.id,
        authoredId: where?.id ?? item.name,
        label: where?.id ?? span.id,
        startFrame: span.startFrame,
        endFrameExclusive: span.endFrameExclusive,
        ...(where === undefined ? {} : { elementRange: where.range }),
        stackOrder: span.stackOrder,
      };
    });
    tracks.push({
      id: item.name,
      label: item.name,
      row: 0,
      clips,
      ...(item.track === undefined
        ? { waiting: item.unserved.length > 0 ? item.unserved : ["something this preview could not build"] }
        : {}),
    });
  }
  // The lowest Present sits at the bottom of the timeline, as it does in the
  // picture. A Track nobody could build keeps its place rather than vanishing.
  const depth = (track: Track): number =>
    track.clips.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...track.clips.map((clip) => clip.stackOrder));
  const ordered = [...tracks].sort((left, right) => depth(right) - depth(left));
  const rows = ordered.map((track, row) => ({ ...track, row }));

  const script = scriptMap(built.source.observations.sourceMaps, built);
  const frameCount = Math.max(1, ...rows.flatMap((track) => track.clips.map((clip) => clip.endFrameExclusive)));
  return {
    revision: input.revision,
    source: { path: input.path, text: input.text, digest: input.digest },
    ...(script === undefined ? {} : { script }),
    space: {
      canvasWidth: input.canvas.width,
      canvasHeight: input.canvas.height,
      clearColor: input.canvas.clearColor,
      frameRate: input.frameRate,
      frameCount,
      durationSec: frameCount * input.frameRate.denominator / input.frameRate.numerator,
    },
    tracks: rows,
    preview: input.preview,
    provenance: {
      timing: built.timing,
      picture: placeholders.size === 0 ? "measured" : "estimated",
      note: note(built),
    },
    refused: built.refused,
  };
}

function note(built: Preview): string {
  const parts: string[] = [];
  parts.push(built.timing === "measured"
    ? "Timings are the ones the Run Source supplied."
    : "No timings were supplied, so words are placed at an ordinary delivery pace.");
  if (built.placeholders.length > 0) {
    parts.push(`${built.placeholders.length} shots have no material yet and stand in as black frames.`);
  }
  const waiting = built.tracks.filter((track) => track.track === undefined);
  if (waiting.length > 0) {
    parts.push(`${waiting.map((track) => track.name).join(", ")} could not be built here: `
      + `${[...new Set(waiting.flatMap((track) => track.unserved))].join(", ")}.`);
  }
  return parts.join(" ");
}

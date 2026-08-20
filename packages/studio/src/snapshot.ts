/**
 * Turn a built programme into what the panels read.
 *
 * A timeline is the Presents of every Track, and a Present carries a span, an
 * identity and a stacking order - the whole contract, for every package. So the
 * timeline is assembled without knowing what made any of it, and a package that
 * grows a new Track shows up without this file changing.
 */
import type {
  CandidateProvenance,
  Clip,
  StudioSnapshot,
  Range,
  ScriptMap,
  SemanticTimeline,
  Track,
} from "./shared.js";
import type { Placement } from "./observe.js";
import type { Preview } from "./programme.js";
import {
  bindStudioTrack,
  projectStudioTrack,
  sealStudioClip,
} from "./studio-registry.js";
import type { StudioEntityDraft } from "./studio-registry.js";

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
  const found = maps.find((map) => map.format === "hypit.script-source-map@1");
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

type NarrativeValue = {
  readonly segments?: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
  }[];
  readonly tokens?: readonly {
    readonly id: string;
    readonly segmentId: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
    readonly text: string;
  }[];
  readonly semanticIndex?: {
    readonly anchors?: readonly {
      readonly id: string;
      readonly kind: "segment-start" | "segment-end" | "token-start" | "token-end";
      readonly segmentId: string;
      readonly tokenId?: string;
    }[];
  };
};

function inlineRecord(compiled: unknown, id: string): unknown {
  const records = (compiled as {
    readonly program: {
      readonly records: readonly { readonly id: string; readonly value: { readonly kind: string; readonly value?: unknown } }[];
    };
  }).program.records;
  const found = records.find((record) => record.id === id);
  return found?.value.kind === "inline" ? found.value.value : undefined;
}

/**
 * Project the compiled Narrative into the frame domain that the preview is
 * already using. No frontend timing is invented here: if an anchor is absent
 * from the built SemanticTrack, the corresponding item is simply not drawable yet.
 */
function semanticTimeline(built: Preview, script: ScriptMap | undefined): SemanticTimeline | undefined {
  const exported = built.source.exports.find((item) => item.type === "Narrative");
  if (exported === undefined) return undefined;
  const narrative = inlineRecord(built.source.compiled, exported.ref) as NarrativeValue | undefined;
  if (narrative === undefined) return undefined;

  const segmentRanges = new Map((script?.segments ?? []).map((item) => [item.id, item.range]));
  const tokenRanges = new Map((script?.tokens ?? []).map((item) => [item.id, item.range]));
  const frame = (id: string): number | undefined => built.anchors.get(id);

  const segments = (narrative.segments ?? []).flatMap((segment) => {
    const startFrame = frame(segment.startAnchorId);
    const endFrame = frame(segment.endAnchorId);
    if (startFrame === undefined || endFrame === undefined) return [];
    return [{
      id: segment.id,
      startFrame,
      endFrameExclusive: Math.max(startFrame + 1, endFrame),
      ...(segmentRanges.has(segment.id) ? { range: segmentRanges.get(segment.id)! } : {}),
    }];
  });
  const tokens = (narrative.tokens ?? []).flatMap((token) => {
    const startFrame = frame(token.startAnchorId);
    const endFrame = frame(token.endAnchorId);
    if (startFrame === undefined || endFrame === undefined) return [];
    return [{
      id: token.id,
      segmentId: token.segmentId,
      text: token.text,
      startFrame,
      endFrameExclusive: Math.max(startFrame + 1, endFrame),
      ...(tokenRanges.has(token.id) ? { range: tokenRanges.get(token.id)! } : {}),
    }];
  });
  const anchors = (narrative.semanticIndex?.anchors ?? []).flatMap((anchor) => {
    const at = frame(anchor.id);
    if (at === undefined) return [];
    return [{
      id: anchor.id,
      kind: anchor.kind,
      frame: at,
      segmentId: anchor.segmentId,
      ...(anchor.tokenId === undefined ? {} : { tokenId: anchor.tokenId }),
    }];
  });
  if (segments.length === 0 && tokens.length === 0) return undefined;
  const provenance: CandidateProvenance = {
    output: built.timingOutput?.name ?? "SemanticTrack",
    ...(built.timingOutput?.ref === undefined ? {} : { outputRef: built.timingOutput.ref }),
    ...(built.timingCandidateId === undefined ? {} : { candidateId: built.timingCandidateId }),
    origin: built.timingCandidateOrigin,
    status: "resolved",
    errors: [],
  };
  return {
    anchors: anchors.sort((left, right) => left.frame - right.frame || left.id.localeCompare(right.id)),
    segments: segments.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id)),
    tokens: tokens.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id)),
    provenance,
  };
}

/** The element an output belongs to: `take-opening.video` is `take-opening`. */
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
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly preview: StudioSnapshot["preview"];
}): StudioSnapshot {
  const located = authored(built.source.observations.placements);
  const script = scriptMap(built.source.observations.sourceMaps, built);
  const semantic = semanticTimeline(built, script);
  // A clip is coloured by the marker that placed it, not by the tag that drew
  // it, so a cutaway and the words that call for it read as the same thing.
  const markers = new Set([
    ...(script?.selections ?? []).map((item) => item.id),
    ...(script?.segments ?? []).map((item) => item.id),
    ...(script?.moments ?? []).map((item) => item.id),
  ]);
  const markerFor = (elementId: string): string | undefined => {
    // The tag may be the element itself or one written inside it; either way
    // what places it is something it points at.
    for (const placement of built.source.observations.placements) {
      const child = placement.children.find((item) => item.id === elementId);
      const paths = placement.id === elementId ? placement.references : child?.references;
      for (const path of paths ?? []) {
        const named = path.slice(path.lastIndexOf(".") + 1);
        if (markers.has(named)) return named;
      }
    }
    return undefined;
  };
  const tracks: Track[] = [];
  for (const item of built.tracks) {
    const projectedSpans = spans(item.track, input.frameRate);
    const binding = bindStudioTrack(item);
    const placement = built.source.observations.placements.find((candidate) =>
      candidate.id === item.trace.authoredId
      && candidate.module.name === item.trace.module
      && candidate.surface === item.trace.surface);
    const generic = (): readonly StudioEntityDraft[] => projectedSpans.map((span) => {
      const where = locate(span.id, located);
      const named = [...new Set(span.id.split(/[:#+]/u))].find((part) => markers.has(part));
      const marker = named ?? (where === undefined ? undefined : markerFor(where.id));
      // A clip is itself before it is what placed it: four rows of one board
      // are four things, and collapsing them onto the marker they share would
      // make them one.
      const identity = where?.id ?? marker ?? item.name;
      return {
        id: `${item.outputRef}:${span.id}`,
        ...(item.type === "VisualTrack" ? { presentId: span.id } : {}),
        authoredId: identity,
        ...(marker === undefined ? {} : { markerId: marker }),
        label: where?.id ?? span.id,
        startFrame: span.startFrame,
        endFrameExclusive: span.endFrameExclusive,
        ...(where === undefined ? {} : { elementRange: where.range }),
        stackOrder: span.stackOrder,
      };
    });
    const clips: Clip[] = projectStudioTrack({
      track: item,
      ...(placement === undefined ? {} : { placement }),
      spans: projectedSpans,
      values: built.values,
      generic,
    }).map((draft) => sealStudioClip(item.outputRef, draft, binding));
    const provenance: CandidateProvenance = {
      output: item.name,
      outputRef: item.outputRef,
      ...(item.candidateId === undefined ? {} : { candidateId: item.candidateId }),
      origin: item.candidateOrigin,
      status: "resolved",
      errors: [],
    };
    tracks.push({
      id: item.outputRef,
      label: item.name,
      row: 0,
      clips,
      binding,
      provenance,
    });
  }
  // The lowest Present sits at the bottom of the timeline, as it does in the
  // picture. A Track nobody could build keeps its place rather than vanishing.
  const depth = (track: Track): number =>
    track.clips.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...track.clips.map((clip) => clip.stackOrder));
  const ordered = [...tracks].sort((left, right) => depth(right) - depth(left));
  const rows = ordered.map((track, row) => ({ ...track, row }));

  const declared = (built.space as { durationSec?: number; frameRate?: { numerator: number; denominator: number } })
    ?.durationSec;
  const frameCount = Math.max(
    1,
    declared === undefined
      ? 0
      : Math.round(declared * input.frameRate.numerator / input.frameRate.denominator),
    ...rows.flatMap((track) => track.clips.map((clip) => clip.endFrameExclusive)),
    ...(semantic?.segments ?? []).map((segment) => segment.endFrameExclusive),
    ...(semantic?.tokens ?? []).map((token) => token.endFrameExclusive),
  );
  return {
    revision: input.revision,
    source: { path: input.path, text: input.text },
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
    ...(semantic === undefined ? {} : { semantic }),
    preview: input.preview,
    provenance: {
      timing: "measured",
      picture: "measured",
      note: note(built),
    },
  };
}

function note(_built: Preview): string {
  return "Timings and material are the Candidates selected by the Run Source.";
}

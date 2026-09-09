/**
 * Turn a built programme into what the panels read.
 *
 * A timeline is the Presents of every Track, and a Present carries a span, an
 * identity and a stacking order - the whole contract, for every package. So the
 * timeline is assembled without knowing what made any of it, and a package that
 * grows a new Track shows up without this file changing.
 */
import { relative } from "node:path";

import type { MarkupSurfaceRegistryLike } from "@hypit/markup";
import { compositionTypes } from "@hypit/composition";
import { narrativeTypes } from "@hypit/narrative";
import { sameModule, sameType } from "@hypit/protocol";

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
  sealStudioClip,
} from "./studio-registry.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import type { StudioEntityDraft } from "./studio-registry.js";
import { inspectorFieldsForBindings, resolveTimelineEditHandles, sourceBindingsForDraft, temporalBindingDeclarations } from "./parameters.js";
import type { StudioSourceFile } from "./parameters.js";

type Present = {
  readonly id: string;
  readonly subjectId?: string;
  readonly span: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly stacking: { readonly order: number };
};

/** Sound is placed in samples rather than frames, in the canonical 48 kHz. */
const SAMPLE_RATE = 48_000;

type AudioClip = {
  readonly id: string;
  readonly subjectId?: string;
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
): readonly { id: string; subjectId?: string; startFrame: number; endFrameExclusive: number; stackOrder: number }[] {
  const held = track as { presents?: readonly Present[]; clips?: readonly AudioClip[] } | undefined;
  if (held?.presents !== undefined) {
    return held.presents.map((present) => ({
      id: present.id,
      ...(present.subjectId === undefined ? {} : { subjectId: present.subjectId }),
      startFrame: present.span.startFrame,
      endFrameExclusive: present.span.endFrameExclusive,
      stackOrder: present.stacking.order,
    }));
  }
  const perSecond = frameRate.numerator / frameRate.denominator;
  return (held?.clips ?? []).map((clip) => ({
    id: clip.id,
    ...(clip.subjectId === undefined ? {} : { subjectId: clip.subjectId }),
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
  return found;
}

function scriptMap(
  maps: Preview["source"]["observations"]["sourceMaps"],
  built: Preview,
  narrativeId: string,
): ScriptMap | undefined {
  const candidates = maps.filter((map, index) => map.narrativeId === narrativeId
    && maps.findIndex((other) => other.narrativeId === map.narrativeId
      && other.sourcePath === map.sourcePath
      && other.range.start === map.range.start
      && other.range.end === map.range.end) === index);
  if (candidates.length > 1) {
    throw new Error(`Studio Narrative id ${narrativeId} is declared by more than one Script in the Source closure.`);
  }
  const found = candidates[0];
  if (found === undefined) return undefined;
  const selections = found.selections;
  const segments = found.segments;
  const moments = found.moments;
  return {
    companion: found.companion,
    narrativeId: found.narrativeId,
    sourcePath: found.sourcePath,
    range: found.range,
    content: found.content,
    // A Segment is the outermost range a Script declares; a Selection written
    // inside one is a level down, and one inside that another.
    segments: segments.map((segment) => ({ ...segment, depth: 0 })),
    selections: selections.map((selection) => ({
      ...selection,
      depth: depthOf(selection, selections),
    })),
    moments,
    // A Script says where a word is written; the timings say when it is said.
    tokens: found.tokens.flatMap((token) => {
      const placed = built.tokens.find((item) => item.id === token.id);
      const startFrame = placed === undefined ? undefined : built.anchors.get(placed.startAnchorId);
      const endFrame = placed === undefined ? undefined : built.anchors.get(placed.endAnchorId);
      if (startFrame === undefined || endFrame === undefined) return [];
      return [{ id: token.id, range: token.range, startFrame, endFrame }];
    }),
  };
}

type NarrativeValue = {
  readonly id?: string;
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
  readonly selections?: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
  }[];
  readonly moments?: readonly {
    readonly id: string;
    readonly anchorId: string;
  }[];
  readonly semanticIndex?: {
    readonly anchors?: readonly {
      readonly id: string;
      readonly kind: "program-start" | "segment-start" | "segment-end" | "token-start" | "token-end" | "program-end";
      readonly segmentId?: string;
      readonly tokenId?: string;
    }[];
  };
};

/**
 * Project the compiled Narrative into the frame domain that the preview is
 * already using. No frontend timing is invented here: if an anchor is absent
 * from the built SemanticTrack, the corresponding item is simply not drawable yet.
 */
function semanticTimeline(
  registry: StudioCompanionRegistry,
  built: Preview,
  script: ScriptMap | undefined,
): SemanticTimeline | undefined {
  if (built.narrativeId === undefined) return undefined;
  const records = built.source.compiled.program.records.filter((item) =>
    sameType(item.type, narrativeTypes.narrative)
    && item.value.kind === "inline"
    && (item.value.value as NarrativeValue).id === built.narrativeId);
  if (records.length > 1) {
    throw new Error(`Studio Narrative id ${built.narrativeId} resolves to more than one authored value.`);
  }
  const record = records[0];
  const narrative = record?.value.kind === "inline"
    ? record.value.value as NarrativeValue
    : undefined;
  if (narrative === undefined) throw new Error("Studio Narrative is not an inline authored value.");

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
      ...(anchor.segmentId === undefined ? {} : { segmentId: anchor.segmentId }),
      ...(anchor.tokenId === undefined ? {} : { tokenId: anchor.tokenId }),
    }];
  });
  const selections = (narrative.selections ?? []).flatMap((selection) => {
    const startFrame = frame(selection.startAnchorId);
    const endFrameExclusive = frame(selection.endAnchorId);
    if (startFrame === undefined || endFrameExclusive === undefined || endFrameExclusive <= startFrame) return [];
    return [{
      id: selection.id,
      startAnchorId: selection.startAnchorId,
      endAnchorId: selection.endAnchorId,
      startFrame,
      endFrameExclusive,
    }];
  });
  const moments = (narrative.moments ?? []).flatMap((moment) => {
    const at = frame(moment.anchorId);
    return at === undefined ? [] : [{ id: moment.id, anchorId: moment.anchorId, frame: at }];
  });
  if (segments.length === 0) throw new Error("Studio SemanticTrack resolves no authored Segment anchors.");
  const provenance: CandidateProvenance = {
    output: built.timingOutput?.name ?? "SemanticTrack",
    ...(built.timingOutput?.ref === undefined ? {} : { outputRef: built.timingOutput.ref }),
    ...(built.timingCandidateId === undefined ? {} : { candidateId: built.timingCandidateId }),
    origin: built.timingCandidateOrigin,
    status: "resolved",
    errors: [],
  };
  return {
    spaceId: built.space.id,
    narrativeId: built.narrativeId,
    // Semantic is a Studio lane with its own registered meaning. Do not copy
    // the authored Speech Track id into this label: it is the timebase, not a
    // second Speech output.
    presentation: registry.semanticTimelinePresentation(),
    // Narrative order is the semantic ruler. Frame ties are common and must
    // not erase the discrete 2M+2N+2 anchor ordering used by writeback.
    anchors,
    segments: segments.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id)),
    tokens: tokens.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id)),
    selections: selections.sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id)),
    moments: moments.sort((left, right) => left.frame - right.frame || left.id.localeCompare(right.id)),
    provenance,
  };
}

/** The element an output belongs to: `take-opening.video` is `take-opening`. */
function depthOf(
  selection: Omit<ScriptMap["selections"][number], "depth">,
  all: readonly Omit<ScriptMap["selections"][number], "depth">[],
): number {
  let depth = 1;
  for (const other of all) {
    if (other.id === selection.id) continue;
    if (other.open.start < selection.open.start && other.close.end > selection.close.end) depth += 1;
  }
  return depth;
}

export function snapshot(registry: StudioCompanionRegistry, built: Preview, input: {
  readonly revision: number;
  readonly path: string;
  readonly text: string;
  readonly run: StudioSnapshot["run"];
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly preview: StudioSnapshot["preview"];
  readonly workspaceRoot: string;
  readonly sourceFiles: readonly StudioSourceFile[];
  readonly surfaces: MarkupSurfaceRegistryLike;
}): StudioSnapshot {
  const located = authored(built.source.observations.placements);
  const script = built.narrativeId === undefined ? undefined : scriptMap(built.source.observations.sourceMaps, built, built.narrativeId);
  const semantic = semanticTimeline(registry, built, script);
  const tracks: Track[] = [];
  for (const item of built.tracks) {
    const projectedSpans = spans(item.value, input.frameRate);
    const binding = registry.bindTrack(item);
    const placement = item.trace.module === undefined ? undefined
      : built.source.observations.placements.find((candidate) =>
        candidate.id === item.trace.authoredId
        && sameModule(candidate.module, item.trace.module!)
        && candidate.surface === item.trace.surface);
    const generic = (): readonly StudioEntityDraft[] => projectedSpans.map((span) => {
      const identity = span.subjectId ?? span.id;
      const where = located.find((candidate) => candidate.id === identity);
      return {
        id: `${item.outputRef}:${span.id}`,
        ...(sameType(item.typeRef, compositionTypes.visualTrack) ? { presentId: span.id } : {}),
        authoredId: identity,
        display: { title: identity, layers: [] },
        startFrame: span.startFrame,
        endFrameExclusive: span.endFrameExclusive,
        ...(where === undefined ? {} : { elementRange: where.range }),
        stackOrder: span.stackOrder,
      };
    });
    const drafts = registry.projectTrack({
      track: item,
      ...(placement === undefined ? {} : { placement }),
      ...(item.surfacePreview === undefined ? {} : { surfacePreview: item.surfacePreview }),
      spans: projectedSpans,
      values: built.values,
      temporalBindings: built.temporalBindings.get(item.outputRef) ?? [],
      semantic,
      generic,
    }).map((draft) => {
      const bindings = sourceBindingsForDraft({
        root: input.workspaceRoot,
        files: input.sourceFiles,
        placement,
        draft,
        declarations: [
          ...registry.bindingDeclarations(item, placement, draft.lane),
          ...temporalBindingDeclarations(draft.temporal),
        ],
        placements: built.source.observations.placements,
      });
      const inspector = inspectorFieldsForBindings(
        draft,
        bindings,
        registry.inspectorDeclarations(item, placement, draft.lane),
      );
      const editHandles = resolveTimelineEditHandles(
        bindings,
        draft.temporal,
        semantic,
      );
      return {
        draft,
        inspector,
        editHandles,
      };
    });
    const clips: Clip[] = drafts
      .filter(({ draft }) => draft.lane === undefined)
      .map(({ draft, inspector, editHandles }) => sealStudioClip(item.outputRef, draft, binding, editHandles, inspector));
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
    for (const attachment of registry.trackAttachments(item)) {
      const attachedDrafts = drafts.filter(({ draft }) => draft.lane === attachment.attachmentId);
      if (attachedDrafts.length === 0) continue;
      tracks.push({
        id: `${item.outputRef}::studio::${attachment.attachmentId}`,
        label: attachment.label ?? attachment.attachmentId ?? item.name,
        row: 0,
        clips: attachedDrafts.map(({ draft, inspector, editHandles }) =>
          sealStudioClip(item.outputRef, draft, attachment, editHandles, inspector)),
        binding: attachment,
        provenance,
      });
    }
  }
  // Root lanes retain Film's authored organizational order. A Present's z is
  // local compositing data and cannot define the order of a Track containing
  // independently stacked items. Studio-only detail lanes stay beside the
  // root that produced them in this list.
  const rows = tracks.map((track, row) => ({ ...track, row }));

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
    source: {
      path: input.path,
      text: input.text,
      files: input.sourceFiles.map((file) => ({
        path: relative(input.workspaceRoot, file.path),
        text: file.text,
        language: file.language,
        role: file.role ?? "dependency",
        imports: (file.imports ?? []).map((item) => item.source),
      })),
    },
    run: input.run,
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
      timing: built.timing,
      picture: "resolved",
      note: note(built),
    },
  };
}

function note(_built: Preview): string {
  return "Composition and timing are resolved from the selected Run Source.";
}

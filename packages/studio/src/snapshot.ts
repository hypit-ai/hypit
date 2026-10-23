import { composeParameterDeclarations } from "./parameters.js";
/**
 * Turn the resolved Studio projection into what the panels read.
 *
 * The Timeline owns the work range. Companions project selectable Items onto
 * that range without extending it or requiring component-specific editor code.
 */
import { isAbsolute, relative } from "node:path";

import type { MarkupSurfaceRegistryLike } from "@hypit/hypit/markup";
import { audioTrackClips, compositionTypes } from "@hypit/composition";
import type { AudioTrack, VisualTrack } from "@hypit/composition";
import type { TypeRef } from "@hypit/hypit/protocol";
import { timelineFrameCount } from "@hypit/timeline";
import { temporalTypes } from "@hypit/temporal";
import type { TemporalInstant } from "@hypit/temporal";
import { sameModule, sameType } from "@hypit/hypit/protocol";

import type {
  StudioItem,
  StudioSnapshot,
  StudioTerminalTarget,
  Range,
  TemporalDomainView,
  StudioTrack,
} from "./shared.js";
import type { StudioSpan, StudioTerminalLink } from "@hypit/studio-companion";
import type { Placement } from "./observe.js";
import type { StudioProjection } from "./projection.js";
import type { ExecutedGraph } from "./temporal-graph.js";
import {
  sealStudioItem,
} from "./studio-registry.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import type { StudioItemDraft } from "./studio-registry.js";
import { inspectorFieldsForBindings, resolveTimelineEditHandles, sourceBindingsForDraft } from "./parameters.js";
import type { StudioSourceFile } from "./parameters.js";
import { temporalAuthorBindings } from "./temporal-inverse.js";

const timelineBandHeightPx = 15;

/** Resolved facts consumed by snapshot projection; execution services and stored materials stay outside it. */
export type SnapshotProjection = Pick<StudioProjection,
  "source" | "tracks" | "values" | "temporalDomainValues" | "temporalValues"
  | "temporalBindings" | "timeline"> & {
    readonly state: ExecutedGraph;
  };

/** Sound is placed in samples rather than frames, in the canonical 48 kHz. */
const SAMPLE_RATE = 48_000;

/**
 * Both kinds of Track say the same thing in their own domain: a named span.
 * Reading them into one shape is what lets the timeline hold both without
 * knowing which package made either.
 */
function spans(
  type: TypeRef,
  track: unknown,
  frameRate: { readonly numerator: number; readonly denominator: number },
  visualOccurrences: readonly (readonly string[])[],
): readonly ResolvedStudioSpan[] {
  if (sameType(type, compositionTypes.visualTrack)) {
    return (track as VisualTrack).items.map((item, index) => ({
      id: item.id,
      ...(item.subjectId === undefined ? {} : { subjectId: item.subjectId }),
      terminalKind: item.kind === "present" ? "visual-present" as const : "visual-adjustment" as const,
      targets: visualOccurrences.map((occurrencePath): StudioTerminalTarget => item.kind === "present"
        ? { kind: "visual-present", occurrencePath, presentId: item.id }
        : { kind: "visual-adjustment", occurrencePath, adjustmentId: item.id }),
      startFrame: item.span.startFrame,
      endFrameExclusive: item.span.endFrameExclusive,
      // Studio derives a paint index from the terminal Track sequence. It is a
      // view concern, not metadata carried by the visual item itself.
      stackOrder: index,
    }));
  }
  if (!sameType(type, compositionTypes.audioTrack)) {
    throw new Error(`Studio cannot project terminal spans for ${type.module.name}@${type.module.version}#${type.name}.`);
  }
  const perSecond = frameRate.numerator / frameRate.denominator;
  return audioTrackClips(track as AudioTrack).map((clip) => ({
    id: clip.id,
    ...(clip.subjectId === undefined ? {} : { subjectId: clip.subjectId }),
    terminalKind: "audio" as const,
    targets: [],
    startFrame: Math.floor(clip.target.startSample / SAMPLE_RATE * perSecond),
    endFrameExclusive: Math.max(
      Math.floor(clip.target.startSample / SAMPLE_RATE * perSecond) + 1,
      Math.ceil(clip.target.endSampleExclusive / SAMPLE_RATE * perSecond),
    ),
    // Sound is under every picture, so it sits at the bottom of the timeline.
    stackOrder: Number.MIN_SAFE_INTEGER,
  }));
}

type ResolvedStudioSpan = StudioSpan & {
  readonly terminalKind: "visual-present" | "visual-adjustment" | "audio";
  readonly targets: readonly StudioTerminalTarget[];
};

function resolveTerminalTargets(
  spans: readonly ResolvedStudioSpan[],
  links: readonly StudioTerminalLink[] | undefined,
): readonly StudioTerminalTarget[] {
  if (links === undefined) return [];
  const found: StudioTerminalTarget[] = [];
  for (const link of links) {
    const span = spans.find((candidate) => candidate.id === link.spanId);
    if (span === undefined) throw new Error(`Studio terminal link '${link.spanId}' does not name a terminal span.`);
    for (const target of span.targets) {
      found.push(target.kind === "visual-present" && link.elementId !== undefined
        ? { ...target, elementId: link.elementId }
        : target);
    }
  }
  const seen = new Set<string>();
  return found.filter((target) => {
    const key = JSON.stringify(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Where an authored id was written, whatever kind of thing it names. */
type Located = { readonly id: string; readonly path: string; readonly range: Range };

function presentationPath(root: string, path: string): string {
  return isAbsolute(path) ? relative(root, path) : path;
}

function authored(root: string, placements: readonly Placement[]): readonly Located[] {
  const found: Located[] = [];
  for (const placement of placements) {
    if (placement.id !== undefined) found.push({
      id: placement.id,
      path: presentationPath(root, placement.sourcePath),
      range: placement.range,
    });
    for (const child of placement.children) {
      if (child.id !== undefined) found.push({
        id: child.id,
        path: presentationPath(root, child.sourcePath),
        range: child.range,
      });
    }
  }
  return found;
}

function presentationDraft(root: string, draft: StudioItemDraft): StudioItemDraft {
  return draft.elementLocation === undefined ? draft : {
    ...draft,
    elementLocation: {
      path: presentationPath(root, draft.elementLocation.path),
      range: draft.elementLocation.range,
    },
  };
}

/** Package Companions project their own temporal facts onto Studio's absolute ruler. */
function temporalDomains(
  registry: StudioCompanionRegistry,
  built: SnapshotProjection,
  workspaceRoot: string,
): readonly TemporalDomainView[] {
  return built.source.observations.temporalDomains.flatMap((source) => {
    const projected = registry.projectTemporalDomain({ source, values: built.temporalDomainValues, timeline: built.timeline });
    return projected.filter((view) => view.timelineId === built.timeline.id).map((view) => ({ ...view, companion: source.companion,
      presentation: registry.temporalDomainPresentation(source.companion),
      source: { path: presentationPath(workspaceRoot, source.sourcePath), content: source.content } }));
  });
}

/** Package-declared Instants share one read-only Timeline row. */
function temporalDeclarationDomain(
  registry: StudioCompanionRegistry,
  built: SnapshotProjection,
  source: { readonly path: string; readonly text: string },
  workspaceRoot: string,
): TemporalDomainView {
  const values = new Map(built.temporalValues.map((item) => [item.id, item] as const));
  const declarations = built.source.observations.placements.flatMap((placement) =>
    registry.projectTemporalDeclarations(placement).map((draft) => ({ placement, draft })));
  const anchors: TemporalDomainView["anchors"][number][] = [];
  const items: TemporalDomainView["items"][number][] = [];
  const seen = new Set<string>();
  for (const { placement, draft } of declarations) {
    if (seen.has(draft.output)) continue;
    const found = values.get(draft.output);
    if (found === undefined || !sameType(found.type, temporalTypes.instant)) continue;
    const range = placement.sourcePath === source.path ? draft.range : undefined;
    const value = found.value as TemporalInstant;
    if (value.timelineId !== built.timeline.id) continue;
    const anchorId = `${draft.output}:point`;
    anchors.push({ id: anchorId, kind: "instant", frame: value.frame });
    items.push({ kind: "point", appearance: "marker", id: draft.output, laneId: "declarations",
      label: draft.label ?? draft.id, anchorId, frame: value.frame,
      ...(range === undefined ? {} : { range }) });
    seen.add(draft.output);
  }
  return {
    id: "absolute-declarations",
    companion: "studio#absolute-declarations",
    timelineId: built.timeline.id,
    presentation: { family: "temporal", tone: "teal", label: "Instants", icon: "timeline" },
    lanes: [{ id: "declarations", label: "Instants", heightPx: timelineBandHeightPx }],
    anchors,
    items,
    editItems: [],
    source: { path: presentationPath(workspaceRoot, source.path), content: { start: 0, end: source.text.length } },
  };
}

export function snapshot(registry: StudioCompanionRegistry, built: SnapshotProjection, input: {
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
  const located = authored(input.workspaceRoot, built.source.observations.placements);
  const domains = [
    ...temporalDomains(registry, built, input.workspaceRoot),
    temporalDeclarationDomain(registry, built, input, input.workspaceRoot),
  ];
  const tracks: StudioTrack[] = [];
  for (const item of built.tracks) {
    const projectedSpans = spans(item.typeRef, item.value, input.frameRate, item.visualOccurrences);
    const binding = registry.bindTrack(item);
    const placement = item.trace.module === undefined ? undefined
      : built.source.observations.placements.find((candidate) =>
        candidate.id === item.trace.authoredId
        && sameModule(candidate.module, item.trace.module!)
        && candidate.surface === item.trace.surface);
    const generic = (): readonly StudioItemDraft[] => projectedSpans.map((span) => {
      const identity = span.subjectId ?? span.id;
      const where = located.find((candidate) => candidate.id === identity);
      return {
        id: `terminal:${span.id}`,
        terminalLinks: [{ spanId: span.id }],
        authoredId: identity,
        display: { title: identity, layers: [] },
        startFrame: span.startFrame,
        endFrameExclusive: span.endFrameExclusive,
        ...(where === undefined ? {} : { elementLocation: { path: where.path, range: where.range } }),
        stackOrder: span.stackOrder,
        ...(span.terminalKind === "visual-adjustment"
          ? { presentation: { kind: "adjustment", chrome: "compact" as const } }
          : {}),
      };
    });
    const companionContext = {
      track: item,
      ...(placement === undefined ? {} : { placement }),
      ...(item.surfacePreview === undefined ? {} : { surfacePreview: item.surfacePreview }),
      spans: projectedSpans,
      values: built.values,
      temporalBindings: built.temporalBindings.get(item.outputRef) ?? [],
      temporalDomains: domains,
      generic,
    };
    const drafts = registry.projectTrack(companionContext).map((draft) => {
      const declarations = composeParameterDeclarations({
        placement, draft, placements: built.source.observations.placements, registry,
        bindings: registry.bindingDeclarations(item, draft.lane),
        inspector: registry.inspectorDeclarations(item, draft.lane),
      });
      const ordinaryBindings = sourceBindingsForDraft({
        root: input.workspaceRoot,
        files: input.sourceFiles,
        placement,
        draft,
        declarations: declarations.bindings,
        placements: built.source.observations.placements,
      });
      const temporalBindings = draft.temporal === undefined ? [] : temporalAuthorBindings({
        state: built.state,
        rootRecord: draft.temporal.record,
        workspaceRoot: input.workspaceRoot,
        placements: built.source.observations.placements,
        files: input.sourceFiles,
      });
      const bindings = [...ordinaryBindings, ...temporalBindings];
      const inspector = inspectorFieldsForBindings(
        draft,
        bindings,
        declarations.inspector,
      );
      const editHandles = resolveTimelineEditHandles(
        bindings,
        draft.temporal,
        domains,
      );
      return {
        draft,
        inspector,
        editHandles,
      };
    });
    const inspectorObjects = registry.projectInspectorObjects(companionContext).map(({ label, draft, bindings: declaredBindings, inspector: declaredInspector }) => {
      const declarations = composeParameterDeclarations({
        placement,
        draft,
        placements: built.source.observations.placements,
        registry,
        bindings: declaredBindings,
        inspector: declaredInspector,
      });
      const bindings = sourceBindingsForDraft({
        root: input.workspaceRoot,
        files: input.sourceFiles,
        placement,
        draft,
        declarations: declarations.bindings,
        placements: built.source.observations.placements,
      });
      return {
        id: JSON.stringify(["inspector", item.outputRef, draft.id]),
        group: label,
        title: draft.title,
        ...(draft.elementLocation === undefined ? {} : { elementLocation: {
          path: presentationPath(input.workspaceRoot, draft.elementLocation.path),
          range: draft.elementLocation.range,
        } }),
        inspector: inspectorFieldsForBindings(draft, bindings, declarations.inspector),
      };
    });
    const items: StudioItem[] = drafts
      .filter(({ draft }) => draft.lane === undefined)
      .map(({ draft, inspector, editHandles }) => sealStudioItem(
        item.outputRef,
        undefined,
        presentationDraft(input.workspaceRoot, draft),
        binding,
        resolveTerminalTargets(projectedSpans, draft.terminalLinks),
        editHandles,
        inspector,
      ));
    tracks.push({
      id: item.outputRef,
      label: item.name,
      row: 0,
      items,
      inspectorObjects,
      binding,
    });
    for (const attachment of registry.trackAttachments(item)) {
      const attachedDrafts = drafts.filter(({ draft }) => draft.lane === attachment.attachmentId);
      if (attachedDrafts.length === 0) continue;
      tracks.push({
        id: JSON.stringify(["track", item.outputRef, attachment.attachmentId]),
        label: attachment.label ?? attachment.attachmentId ?? item.name,
        row: 0,
        items: attachedDrafts.map(({ draft, inspector, editHandles }) =>
          sealStudioItem(
            item.outputRef,
            attachment.attachmentId,
            presentationDraft(input.workspaceRoot, draft),
            attachment,
            resolveTerminalTargets(projectedSpans, draft.terminalLinks),
            editHandles,
            inspector,
          )),
        inspectorObjects: [],
        binding: attachment,
      });
    }
  }
  // Root lanes retain Film's authored organizational order. Track-local paint
  // position cannot define the order of a lane containing several Items.
  // Companion-declared Attachment Tracks stay beside their owning root Track.
  const rows = tracks.map((track, row) => ({ ...track, row }));

  const frameCount = timelineFrameCount(built.timeline);
  return {
    revision: input.revision,
    source: {
      path: presentationPath(input.workspaceRoot, input.path),
      text: input.text,
      files: input.sourceFiles.map((file) => ({
        path: presentationPath(input.workspaceRoot, file.path),
        text: file.text,
        language: file.language,
        role: file.role ?? "dependency",
        imports: (file.imports ?? []).map((item) => item.source),
      })),
    },
    run: input.run,
    canvas: {
      width: input.canvas.width,
      height: input.canvas.height,
      clearColor: input.canvas.clearColor,
    },
    timeline: {
      frameRate: input.frameRate,
      frameCount,
      durationSec: frameCount * input.frameRate.denominator / input.frameRate.numerator,
    },
    tracks: rows,
    temporalDomains: domains,
    preview: input.preview,
  };
}

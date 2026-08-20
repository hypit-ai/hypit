import { audioAdapters } from "./adapters/audio.js";
import { genericAdapters } from "./adapters/generic.js";
import { mediaAdapters } from "./adapters/media.js";
import { rankingAdapters } from "./adapters/ranking.js";
import { speechAdapters } from "./adapters/speech.js";
import type { StudioAdapter, StudioEntityDraft, StudioProjectionRole, StudioSpan } from "./adapters/types.js";
import { flatLane, readonlyInteraction, standardInspector } from "./adapters/types.js";
import type { Placement } from "./observe.js";
import type { BuiltTrack } from "./programme.js";
import type { Clip, StudioTrackBinding } from "./shared.js";

export type { StudioEntityDraft, StudioProjectionRole, StudioSpan } from "./adapters/types.js";

/** One Studio-local registry. Author packages and Core know nothing about it. */
const REGISTRY: readonly StudioAdapter[] = [
  ...rankingAdapters,
  ...speechAdapters,
  ...mediaAdapters,
  ...audioAdapters,
  ...genericAdapters,
];

function matches(
  adapter: StudioAdapter,
  type: string,
  placement: Placement | undefined,
  siblingTypes: readonly string[],
): boolean {
  const rule = adapter.output;
  return rule.type === type
    && (rule.surface === undefined || rule.surface === placement?.surface)
    && (rule.modules === undefined || (placement !== undefined && rule.modules.includes(placement.module.name)))
    && (rule.siblingType === undefined || siblingTypes.includes(rule.siblingType));
}

function adapterFor(
  type: string,
  placement: Placement | undefined,
  siblingTypes: readonly string[],
): StudioAdapter | undefined {
  return REGISTRY.find((adapter) => matches(adapter, type, placement, siblingTypes));
}

export function classifyStudioOutput(
  type: string,
  placement: Placement | undefined,
  siblingTypes: readonly string[],
): StudioProjectionRole | undefined {
  return adapterFor(type, placement, siblingTypes)?.role;
}

export function studioDependencyRole(
  role: StudioProjectionRole,
  type: string,
): StudioProjectionRole | undefined {
  return REGISTRY
    .filter((adapter) => adapter.role === role)
    .flatMap((adapter) => adapter.dependencies ?? [])
    .find((dependency) => dependency.type === type)?.role;
}

export function studioRealizationPorts(
  type: string,
  placement: Placement | undefined,
  siblingTypes: readonly string[],
): readonly string[] {
  return adapterFor(type, placement, siblingTypes)?.realizationPorts ?? [];
}

function trackAdapter(track: BuiltTrack): StudioAdapter {
  return REGISTRY.find((adapter) =>
    adapter.family !== undefined
    && adapter.role === track.role
    && adapter.output.type === track.type
    && (adapter.output.surface === undefined || adapter.output.surface === track.trace.surface)
    && (adapter.output.modules === undefined
      || (track.trace.module !== undefined && adapter.output.modules.includes(track.trace.module))))!;
}

export function bindStudioTrack(track: BuiltTrack): StudioTrackBinding {
  const adapter = trackAdapter(track);
  return {
    family: adapter.family!,
    facet: track.type === "AudioTrack" ? "audio" : "visual",
    groupId: track.trace.authoredId ?? track.outputRef,
    icon: adapter.icon!,
    adapter: adapter.id,
    lane: adapter.lane ?? flatLane,
    inspector: adapter.inspector ?? standardInspector,
    ...(track.trace.placement === undefined ? {} : { authoredTag: track.trace.placement }),
    references: track.trace.references.map(({ name, type }) => ({ name, type })),
    interaction: adapter.interaction ?? readonlyInteraction,
  };
}

export function projectStudioTrack(input: {
  readonly track: BuiltTrack;
  readonly placement?: Placement;
  readonly spans: readonly StudioSpan[];
  readonly values: ReadonlyMap<string, unknown>;
  readonly generic: () => readonly StudioEntityDraft[];
}): readonly StudioEntityDraft[] {
  return trackAdapter(input.track).project?.(input) ?? input.generic();
}

export function sealStudioClip(
  outputRef: string,
  draft: StudioEntityDraft,
  fallback: StudioTrackBinding,
): Clip {
  return {
    id: draft.id.startsWith(`${outputRef}:`) ? draft.id : `${outputRef}:${draft.id}`,
    ...(draft.presentId === undefined ? {} : { presentId: draft.presentId }),
    authoredId: draft.authoredId,
    ...(draft.markerId === undefined ? {} : { markerId: draft.markerId }),
    label: draft.label,
    startFrame: draft.startFrame,
    endFrameExclusive: draft.endFrameExclusive,
    ...(draft.elementRange === undefined ? {} : { elementRange: draft.elementRange }),
    stackOrder: draft.stackOrder,
    presentation: draft.presentation ?? {
      entity: fallback.facet === "audio" ? "audio-clip" : "present",
      shape: fallback.facet === "audio" ? "waveform" : "block",
      depth: 0,
    },
    interaction: draft.interaction ?? fallback.interaction,
    renderIds: draft.renderIds ?? (draft.presentId === undefined ? [] : [draft.presentId]),
  };
}

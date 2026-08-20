import { audioAdapters } from "./adapters/audio.js";
import { deckAdapters } from "./adapters/deck.js";
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
  ...deckAdapters,
  ...speechAdapters,
  ...mediaAdapters,
  ...audioAdapters,
  ...genericAdapters,
];

function matches(
  adapter: StudioAdapter,
  type: string,
  placement: Pick<Placement, "surface" | "module"> | undefined,
  siblingTypes: readonly string[],
): boolean {
  const rule = adapter.output;
  return rule.type === type
    && (rule.surface === undefined || rule.surface === placement?.surface)
    && (rule.modules === undefined || (placement !== undefined && rule.modules.includes(placement.module.name)))
    && (rule.siblingType === undefined || siblingTypes.includes(rule.siblingType));
}

function specificity(adapter: StudioAdapter): number {
  const rule = adapter.output;
  return (rule.surface === undefined ? 0 : 8)
    + (rule.siblingType === undefined ? 0 : 4)
    + (rule.modules === undefined ? 0 : 2);
}

function adapterFor(
  type: string,
  placement: Pick<Placement, "surface" | "module"> | undefined,
  siblingTypes: readonly string[],
): StudioAdapter | undefined {
  const candidates = REGISTRY
    .filter((adapter) => matches(adapter, type, placement, siblingTypes))
    .map((adapter) => ({ adapter, score: specificity(adapter) }))
    .sort((left, right) => right.score - left.score || left.adapter.id.localeCompare(right.adapter.id));
  const best = candidates[0];
  if (best === undefined) return undefined;
  const tied = candidates.filter((candidate) => candidate.score === best.score);
  if (tied.length > 1) {
    throw new Error(`Studio adapters are ambiguous for ${type}: ${tied.map((candidate) => candidate.adapter.id).join(", ")}`);
  }
  return best.adapter;
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

function trackAdapter(track: BuiltTrack): StudioAdapter & { readonly family: StudioTrackBinding["family"] } {
  const placement = track.trace.surface === undefined || track.trace.module === undefined
    ? undefined
    : {
        surface: track.trace.surface,
        module: { name: track.trace.module, version: "" },
      };
  const siblingTypes = track.trace.outputPorts.flatMap((item) => item.type === undefined ? [] : [item.type]);
  const adapter = adapterFor(track.type, placement, siblingTypes);
  const family = adapter?.family;
  if (adapter === undefined || family === undefined) {
    throw new Error(`Studio has no timeline adapter for ${track.type} (${track.name}).`);
  }
  return { ...adapter, family };
}

export function bindStudioTrack(track: BuiltTrack): StudioTrackBinding {
  const adapter = trackAdapter(track);
  return {
    family: adapter.family,
    facet: track.type === "AudioTrack" ? "audio" : "visual",
    groupId: track.trace.authoredId ?? track.outputRef,
    icon: adapter.icon ?? (track.type === "AudioTrack" ? "waveform" : "layers"),
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
  readonly semantic: import("./shared.js").SemanticTimeline;
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
    ...(draft.temporal === undefined ? {} : { temporal: draft.temporal }),
    ...(draft.preview === undefined ? {} : { preview: draft.preview }),
    interaction: draft.interaction ?? fallback.interaction,
    renderIds: draft.renderIds ?? (draft.presentId === undefined ? [] : [draft.presentId]),
  };
}

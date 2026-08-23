import type {
  StudioAdapter,
  StudioAdapterContext,
  StudioEntityDraft,
  StudioLaneAttachment,
  StudioProjectionRole,
  StudioResolvedTrack,
  StudioSpan,
  StudioTimelineGesture,
} from "@hypit/studio-adapter";
import { readonlyInteraction } from "@hypit/studio-adapter";

import type { Placement } from "./observe.js";
import type { Clip, StudioTrackBinding } from "./shared.js";

export type { StudioEntityDraft, StudioProjectionRole, StudioSpan } from "@hypit/studio-adapter";

const flatLane = {
  layout: "flat" as const,
  height: { minPx: 44, preferredPx: 52, maxPx: 96 },
};

const standardInspector = {
  sections: ["authoring", "resolved", "composition", "identity", "run"] as const,
};

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

/** Immutable interpretation assembled for one project session. */
export class StudioAdapterRegistry {
  readonly #adapters: readonly StudioAdapter[];

  constructor(
    adapters: readonly StudioAdapter[],
    options: { readonly replace?: Readonly<Record<string, string>> } = {},
  ) {
    const ids = new Set<string>();
    for (const adapter of adapters) {
      if (ids.has(adapter.id)) throw new Error(`Studio adapter id is repeated: ${adapter.id}`);
      ids.add(adapter.id);
    }
    const replacements = options.replace ?? {};
    for (const [target, replacement] of Object.entries(replacements)) {
      if (!ids.has(target)) throw new Error(`Studio adapter replacement target does not exist: ${target}`);
      if (!ids.has(replacement)) throw new Error(`Studio adapter replacement does not exist: ${replacement}`);
      if (target === replacement) throw new Error(`Studio adapter cannot replace itself: ${target}`);
    }
    this.#adapters = Object.freeze(adapters.filter((adapter) => !(adapter.id in replacements)));
  }

  adapterFor(
    type: string,
    placement: Pick<Placement, "surface" | "module"> | undefined,
    siblingTypes: readonly string[],
  ): StudioAdapter | undefined {
    const candidates = this.#adapters
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

  classifyOutput(
    type: string,
    placement: Placement | undefined,
    siblingTypes: readonly string[],
  ): StudioProjectionRole | undefined {
    return this.adapterFor(type, placement, siblingTypes)?.role;
  }

  dependencyRole(role: StudioProjectionRole, type: string): StudioProjectionRole | undefined {
    return this.#adapters
      .filter((adapter) => adapter.role === role)
      .flatMap((adapter) => adapter.dependencies ?? [])
      .find((dependency) => dependency.type === type)?.role;
  }

  realizationPorts(
    type: string,
    placement: Placement | undefined,
    siblingTypes: readonly string[],
  ): readonly string[] {
    return this.adapterFor(type, placement, siblingTypes)?.realizationPorts ?? [];
  }

  semanticTimelinePresentation(authoredLabel?: string): {
    readonly family: StudioTrackBinding["family"];
    readonly label?: string;
    readonly icon: string;
    readonly lane: StudioTrackBinding["lane"];
  } {
    const adapter = this.adapterFor("SemanticTrack", undefined, []);
    return {
      family: adapter?.family ?? "speech",
      ...(authoredLabel === undefined
        ? (adapter?.label === undefined ? {} : { label: adapter.label })
        : { label: authoredLabel }),
      icon: adapter?.icon ?? "speech",
      lane: adapter?.lane ?? flatLane,
    };
  }

  #trackAdapter(track: StudioResolvedTrack): StudioAdapter & { readonly family: StudioTrackBinding["family"] } {
    const placement = track.trace.surface === undefined || track.trace.module === undefined
      ? undefined
      : { surface: track.trace.surface, module: { name: track.trace.module, version: "" } };
    const siblingTypes = track.trace.outputPorts.flatMap((item) => item.type === undefined ? [] : [item.type]);
    const adapter = this.adapterFor(track.type, placement, siblingTypes);
    const family = adapter?.family;
    if (adapter === undefined || family === undefined) {
      throw new Error(`Studio has no timeline adapter for ${track.type} (${track.name}).`);
    }
    return { ...adapter, family };
  }

  trackAttachments(track: StudioResolvedTrack): readonly StudioTrackBinding[] {
    const root = this.bindTrack(track);
    const adapter = this.#trackAdapter(track);
    return (adapter.attachments ?? []).map((attachment: StudioLaneAttachment) => ({
      family: attachment.family,
      ...(attachment.label === undefined ? {} : { label: attachment.label }),
      facet: attachment.facet,
      groupId: root.groupId,
      icon: attachment.icon,
      adapter: `${adapter.id}:${attachment.id}`,
      attachmentId: attachment.id,
      lane: {
        ...attachment.lane,
        attachedTo: attachment.lane.attachedTo ?? root.lane.groupId ?? root.groupId,
      },
      inspector: attachment.inspector ?? adapter.inspector ?? standardInspector,
      references: root.references,
      interaction: attachment.interaction ?? adapter.interaction ?? readonlyInteraction,
    }));
  }

  bindTrack(track: StudioResolvedTrack): StudioTrackBinding {
    const adapter = this.#trackAdapter(track);
    // An adapter may provide a deliberate presentation label for a facet
    // (e.g. Speech Visual / Speech Audio). Authored ids remain the fallback
    // for ordinary user-named tracks.
    const label = adapter.label ?? track.trace.authoredId;
    return {
      family: adapter.family,
      ...(label === undefined ? {} : { label }),
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

  projectTrack(input: StudioAdapterContext): readonly StudioEntityDraft[] {
    const adapter = this.#trackAdapter(input.track);
    const drafts = adapter.project?.(input) ?? input.generic();
    const preview = input.surfacePreview;
    if (adapter.poster?.source !== "surface-preview" || preview === undefined) return drafts;
    return drafts.map((draft) => draft.lane !== undefined || draft.preview !== undefined
      ? draft
      : { ...draft, preview });
  }

  parameterDeclarations(
    track: StudioResolvedTrack,
    placement: Placement | undefined,
    lane?: string,
  ) {
    const adapter = this.#trackAdapter(track);
    if (lane !== undefined) {
      return adapter.attachments?.find((attachment) => attachment.id === lane)?.parameters ?? [];
    }
    return adapter.parameters ?? [];
  }

  timelineGestures(
    track: StudioResolvedTrack,
    placement: Placement | undefined,
    lane?: string,
  ): readonly StudioTimelineGesture[] {
    const adapter = this.#trackAdapter(track);
    if (lane !== undefined) {
      return adapter.attachments?.find((attachment) => attachment.id === lane)?.timelineGestures ?? [];
    }
    return adapter.timelineGestures ?? [];
  }
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
    parameters: draft.parameters ?? [],
    editHandles: draft.editHandles ?? [],
    interaction: draft.interaction ?? fallback.interaction,
    renderIds: draft.renderIds ?? (draft.presentId === undefined ? [] : [draft.presentId]),
  };
}

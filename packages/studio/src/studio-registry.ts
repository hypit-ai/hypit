import type {
  StudioAdapter,
  StudioAdapterContext,
  StudioEditHandle,
  StudioEntityDraft,
  StudioLaneAttachment,
  StudioProjectionRole,
  StudioResolvedTrack,
  StudioSpan,
  StudioTimelineEditDeclaration,
} from "@hypit/studio-adapter";

import type { Placement } from "./observe.js";
import type { Clip, StudioTrackBinding } from "./shared.js";

export type { StudioEntityDraft, StudioProjectionRole, StudioSpan } from "@hypit/studio-adapter";

const flatLane = {
  heightPx: 52,
};

const tones = new Set(["blue", "green", "teal", "violet", "magenta", "orange", "orange-muted", "neutral"]);
const icons = new Set(["captions", "component", "layers", "ranking", "text", "timeline", "video", "waveform"]);
const chromes = new Set(["standard", "group", "point"]);
const layouts = new Set(["repeat-x", "cover", "contain", "storyboard", "waveform"]);

function validateTimelineEdits(subject: string, edits: readonly StudioTimelineEditDeclaration[] | undefined): void {
  const gestures = new Set<string>();
  for (const edit of edits ?? []) {
    if (gestures.has(edit.gesture)) throw new Error(`${subject} repeats timeline gesture ${edit.gesture}`);
    gestures.add(edit.gesture);
    if (edit.targets.length === 0) throw new Error(`${subject} timeline gesture ${edit.gesture} has no inverse target`);
    for (const target of edit.targets) {
      if (target.kind !== "source-parameters") continue;
      if (target.parameters.length === 0) {
        throw new Error(`${subject} timeline gesture ${edit.gesture} has no source parameters`);
      }
      const roles = new Set<string>();
      for (const parameter of target.parameters) {
        if (parameter.parameter.length === 0 || roles.has(parameter.role)) {
          throw new Error(`${subject} timeline gesture ${edit.gesture} has an invalid source parameter binding`);
        }
        roles.add(parameter.role);
      }
    }
  }
}

function validateAdapterVocabulary(adapter: StudioAdapter): void {
  if (adapter.tone !== undefined && !tones.has(adapter.tone)) {
    throw new Error(`Studio adapter ${adapter.id} selects unsupported tone ${adapter.tone}`);
  }
  if (adapter.icon !== undefined && !icons.has(adapter.icon)) {
    throw new Error(`Studio adapter ${adapter.id} selects unsupported icon ${adapter.icon}`);
  }
  validateTimelineEdits(`Studio adapter ${adapter.id}`, adapter.timelineEdits);
  for (const attachment of adapter.attachments ?? []) {
    if (attachment.tone !== undefined && !tones.has(attachment.tone)) {
      throw new Error(`Studio adapter ${adapter.id} attachment ${attachment.id} selects unsupported tone ${attachment.tone}`);
    }
    if (!icons.has(attachment.icon)) {
      throw new Error(`Studio adapter ${adapter.id} attachment ${attachment.id} selects unsupported icon ${attachment.icon}`);
    }
    validateTimelineEdits(`Studio adapter ${adapter.id} attachment ${attachment.id}`, attachment.timelineEdits);
  }
}

function validateDraftVocabulary(adapter: StudioAdapter, draft: StudioEntityDraft): void {
  validateTimelineEdits(`Studio adapter ${adapter.id} entity ${draft.id}`, draft.timelineEdits);
  if (draft.display === undefined || typeof draft.display.title !== "string" || draft.display.title.trim().length === 0) {
    throw new Error(`Studio adapter ${adapter.id} entity ${draft.id} has no display title`);
  }
  if (!Array.isArray(draft.display.layers)) {
    throw new Error(`Studio adapter ${adapter.id} entity ${draft.id} has invalid display layers`);
  }
  if (draft.presentation !== undefined && !chromes.has(draft.presentation.chrome)) {
    throw new Error(`Studio adapter ${adapter.id} entity ${draft.id} selects unsupported chrome ${draft.presentation.chrome}`);
  }
  for (const [index, layer] of draft.display.layers.entries()) {
    if (layer.kind === "text") {
      if (layer.role !== "content" || typeof layer.text !== "string") {
        throw new Error(`Studio adapter ${adapter.id} entity ${draft.id} has invalid text layer ${index}`);
      }
      continue;
    }
    if (layer.kind !== "preview" || (layer.role !== "content" && layer.role !== "decoration")
      || !layouts.has(layer.layout)
      || !(["image", "video", "audio"] as const).includes(layer.preview.kind)) {
      throw new Error(`Studio adapter ${adapter.id} entity ${draft.id} has invalid preview layer ${index}`);
    }
    const source = layer.preview.source;
    if (source.kind === "artifact") {
      if (typeof source.digest !== "string" || source.digest.length === 0) {
        throw new Error(`Studio adapter ${adapter.id} entity ${draft.id} has invalid Artifact source`);
      }
    } else if (source.kind !== "surface-preview"
      || source.module.length === 0 || source.version.length === 0 || source.surface.length === 0) {
      throw new Error(`Studio adapter ${adapter.id} entity ${draft.id} has invalid Surface preview source`);
    }
  }
}

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
      validateAdapterVocabulary(adapter);
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

  requiredValuePorts(
    type: string,
    placement: Placement | undefined,
    siblingTypes: readonly string[],
  ): readonly string[] {
    return this.adapterFor(type, placement, siblingTypes)?.requiredValues ?? [];
  }

  semanticTimelinePresentation(authoredLabel?: string): {
    readonly family: StudioTrackBinding["family"];
    readonly tone: StudioTrackBinding["tone"];
    readonly label?: string;
    readonly icon: StudioTrackBinding["icon"];
    readonly lane: StudioTrackBinding["lane"];
  } {
    const adapter = this.adapterFor("SemanticTrack", undefined, []);
    return {
      family: adapter?.family ?? "semantic",
      tone: adapter?.tone ?? "teal",
      ...(authoredLabel === undefined
        ? (adapter?.label === undefined ? {} : { label: adapter.label })
        : { label: authoredLabel }),
      icon: adapter?.icon ?? "timeline",
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
      tone: attachment.tone ?? adapter.tone ?? "neutral",
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
      references: root.references,
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
      tone: adapter.tone ?? "neutral",
      ...(label === undefined ? {} : { label }),
      facet: track.type === "AudioTrack" ? "audio" : "visual",
      groupId: track.trace.authoredId ?? track.outputRef,
      icon: adapter.icon ?? (track.type === "AudioTrack" ? "waveform" : "layers"),
      adapter: adapter.id,
      lane: adapter.lane ?? flatLane,
      ...(track.trace.placement === undefined ? {} : { authoredTag: track.trace.placement }),
      references: track.trace.references.map(({ name, type }) => ({ name, type })),
    };
  }

  projectTrack(input: StudioAdapterContext): readonly StudioEntityDraft[] {
    const adapter = this.#trackAdapter(input.track);
    const drafts = adapter.project?.(input) ?? input.generic();
    const preview = input.surfacePreview;
    const surfaceLayer: StudioEntityDraft["display"]["layers"][number] | undefined = preview === undefined
      ? undefined
      : { kind: "preview", role: "decoration", preview, layout: "repeat-x" };
    const projected: readonly StudioEntityDraft[] = adapter.poster?.source !== "surface-preview" || surfaceLayer === undefined
      ? drafts
      : drafts.map((draft) => draft.lane !== undefined
      ? draft
      : {
          ...draft,
          display: {
            ...draft.display,
            layers: [surfaceLayer, ...draft.display.layers],
          },
        });
    for (const draft of projected) validateDraftVocabulary(adapter, draft);
    return projected;
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

  timelineEdits(
    track: StudioResolvedTrack,
    placement: Placement | undefined,
    lane?: string,
  ): readonly StudioTimelineEditDeclaration[] {
    const adapter = this.#trackAdapter(track);
    if (lane !== undefined) {
      return adapter.attachments?.find((attachment) => attachment.id === lane)?.timelineEdits ?? [];
    }
    return adapter.timelineEdits ?? [];
  }
}

export function sealStudioClip(
  outputRef: string,
  draft: StudioEntityDraft,
  fallback: StudioTrackBinding,
  editHandles: readonly StudioEditHandle[] = [],
): Clip {
  return {
    id: draft.id.startsWith(`${outputRef}:`) ? draft.id : `${outputRef}:${draft.id}`,
    ...(draft.presentId === undefined ? {} : { presentId: draft.presentId }),
    authoredId: draft.authoredId,
    ...(draft.markerId === undefined ? {} : { markerId: draft.markerId }),
    display: draft.display,
    startFrame: draft.startFrame,
    endFrameExclusive: draft.endFrameExclusive,
    ...(draft.elementRange === undefined ? {} : { elementRange: draft.elementRange }),
    stackOrder: draft.stackOrder,
    presentation: draft.presentation ?? {
      entity: fallback.facet === "audio" ? "audio-clip" : "present",
      chrome: "standard",
    },
    ...(draft.temporal === undefined ? {} : { temporal: draft.temporal }),
    parameters: draft.parameters ?? [],
    editHandles,
    renderIds: draft.renderIds ?? (draft.presentId === undefined ? [] : [draft.presentId]),
  };
}

import type {
  StudioTrackCompanion,
  StudioTrackCompanionContext,
  StudioEditHandle,
  StudioEntityDraft,
  StudioFilmCompanion,
  StudioLaneAttachment,
  StudioViewRole,
  StudioResolvedTrack,
  StudioScriptAdjustment,
  StudioScriptCompanion,
  StudioScriptSourceMap,
  StudioSourceBindingDeclaration,
  StudioSpan,
} from "@hypit/studio-adapter";
import { studioParameterControls } from "@hypit/studio-adapter";
import { compositionTypes } from "@hypit/composition";
import { sameModule, sameType } from "@hypit/protocol";
import type { ModuleRef, TypeRef } from "@hypit/protocol";
import { semanticTrackTypes } from "@hypit/semantic-track";

import type { Placement } from "./observe.js";
import type { Clip, StudioTrackBinding } from "./shared.js";

export type { StudioEntityDraft, StudioViewRole, StudioSpan } from "@hypit/studio-adapter";

const flatLane = {
  heightPx: 52,
};

const tones = new Set(["blue", "green", "teal", "violet", "magenta", "orange", "orange-muted", "neutral"]);
const icons = new Set(["brand", "captions", "component", "layers", "ranking", "text", "timeline", "video", "waveform"]);
const chromes = new Set(["standard", "group", "point"]);
const layouts = new Set(["repeat-x", "cover", "contain", "storyboard", "waveform"]);
const inspectorDomains = new Set(["where", "how", "when"]);
const inspectorControls = new Set<string>(studioParameterControls);

function bindingPaths(declarations: readonly StudioSourceBindingDeclaration[], prefix = ""): Set<string> {
  const paths = new Set<string>();
  for (const declaration of declarations) {
    const path = prefix.length === 0 ? declaration.name : `${prefix}.${declaration.name}`;
    paths.add(path);
    for (const nested of bindingPaths(declaration.referenced ?? [], path)) paths.add(nested);
    for (const recipe of declaration.recipe?.bindings ?? []) paths.add(`${path}.${recipe.name}`);
  }
  return paths;
}

function validateInspector(
  subject: string,
  bindings: readonly StudioSourceBindingDeclaration[] | undefined,
  fields: StudioTrackCompanion["inspector"],
): void {
  const paths = bindingPaths(bindings ?? []);
  const seen = new Set<string>();
  for (const field of fields ?? []) {
    if (seen.has(field.binding)) throw new Error(`${subject} repeats Inspector field ${field.binding}`);
    seen.add(field.binding);
    if (!paths.has(field.binding)) throw new Error(`${subject} Inspector field ${field.binding} has no source binding`);
    if (!inspectorDomains.has(field.domain)) throw new Error(`${subject} selects unsupported Inspector domain ${field.domain}`);
    if (field.control !== undefined && !inspectorControls.has(field.control)) {
      throw new Error(`${subject} selects unsupported Inspector control ${field.control}`);
    }
    if (field.label.trim().length === 0 || field.section.id.length === 0 || field.section.label.trim().length === 0) {
      throw new Error(`${subject} Inspector field ${field.binding} has incomplete presentation`);
    }
    if (field.control === "select" && (field.options === undefined || field.options.length === 0)) {
      throw new Error(`${subject} Inspector field ${field.binding} has no select options`);
    }
  }
}

function validateCompanionVocabulary(companion: StudioTrackCompanion): void {
  if (companion.tone !== undefined && !tones.has(companion.tone)) {
    throw new Error(`Studio Track Companion ${companion.id} selects unsupported tone ${companion.tone}`);
  }
  if (companion.icon !== undefined && !icons.has(companion.icon)) {
    throw new Error(`Studio Track Companion ${companion.id} selects unsupported icon ${companion.icon}`);
  }
  validateInspector(`Studio Track Companion ${companion.id}`, companion.bindings, companion.inspector);
  for (const attachment of companion.attachments ?? []) {
    if (attachment.tone !== undefined && !tones.has(attachment.tone)) {
      throw new Error(`Studio Track Companion ${companion.id} attachment ${attachment.id} selects unsupported tone ${attachment.tone}`);
    }
    if (!icons.has(attachment.icon)) {
      throw new Error(`Studio Track Companion ${companion.id} attachment ${attachment.id} selects unsupported icon ${attachment.icon}`);
    }
    validateInspector(`Studio Track Companion ${companion.id} attachment ${attachment.id}`, attachment.bindings, attachment.inspector);
  }
}

function validateDraftVocabulary(companion: StudioTrackCompanion, draft: StudioEntityDraft): void {
  if (draft.display === undefined || typeof draft.display.title !== "string" || draft.display.title.trim().length === 0) {
    throw new Error(`Studio Track Companion ${companion.id} entity ${draft.id} has no display title`);
  }
  if (!Array.isArray(draft.display.layers)) {
    throw new Error(`Studio Track Companion ${companion.id} entity ${draft.id} has invalid display layers`);
  }
  if (draft.presentation !== undefined && !chromes.has(draft.presentation.chrome)) {
    throw new Error(`Studio Track Companion ${companion.id} entity ${draft.id} selects unsupported chrome ${draft.presentation.chrome}`);
  }
  for (const [index, layer] of draft.display.layers.entries()) {
    if (layer.kind === "text") {
      if (layer.role !== "content" || typeof layer.text !== "string") {
        throw new Error(`Studio Track Companion ${companion.id} entity ${draft.id} has invalid text layer ${index}`);
      }
      continue;
    }
    if (layer.kind !== "preview" || (layer.role !== "content" && layer.role !== "decoration")
      || !layouts.has(layer.layout)
      || !(["image", "video", "audio"] as const).includes(layer.preview.kind)) {
      throw new Error(`Studio Track Companion ${companion.id} entity ${draft.id} has invalid preview layer ${index}`);
    }
    const source = layer.preview.source;
    if (source.kind === "artifact") {
      if (typeof source.digest !== "string" || source.digest.length === 0) {
        throw new Error(`Studio Track Companion ${companion.id} entity ${draft.id} has invalid Artifact source`);
      }
    } else if (source.kind !== "surface-preview"
      || source.module.length === 0 || source.version.length === 0 || source.surface.length === 0) {
      throw new Error(`Studio Track Companion ${companion.id} entity ${draft.id} has invalid Surface preview source`);
    }
  }
}

function matches(
  companion: StudioTrackCompanion,
  type: TypeRef,
  placement: Pick<Placement, "surface" | "module"> | undefined,
  siblingTypes: readonly TypeRef[],
): boolean {
  const rule = companion.output;
  return sameType(rule.type, type)
    && (rule.surface === undefined || rule.surface === placement?.surface)
    && (rule.modules === undefined || (placement !== undefined
      && rule.modules.some((module) => sameModule(module, placement.module))))
    && (rule.siblingType === undefined || siblingTypes.some((candidate) => sameType(candidate, rule.siblingType!)));
}

function specificity(companion: StudioTrackCompanion): number {
  const rule = companion.output;
  return (rule.surface === undefined ? 0 : 8)
    + (rule.siblingType === undefined ? 0 : 4)
    + (rule.modules === undefined ? 0 : 2);
}

/** Immutable interpretation assembled for one project session. */
export class StudioCompanionRegistry {
  readonly #tracks: readonly StudioTrackCompanion[];
  readonly #films: readonly StudioFilmCompanion[];
  readonly #scripts: readonly StudioScriptCompanion[];

  constructor(
    tracks: readonly StudioTrackCompanion[],
    options: {
      readonly replace?: Readonly<Record<string, string>>;
      readonly films?: readonly StudioFilmCompanion[];
      readonly scripts?: readonly StudioScriptCompanion[];
    } = {},
  ) {
    const ids = new Set<string>();
    for (const companion of tracks) {
      if (ids.has(companion.id)) throw new Error(`Studio Track Companion id is repeated: ${companion.id}`);
      ids.add(companion.id);
      validateCompanionVocabulary(companion);
    }
    const films = [...(options.films ?? [])];
    const scripts = [...(options.scripts ?? [])];
    for (const [label, companions] of [["Film", films], ["Script", scripts]] as const) {
      const companionIds = new Set<string>();
      for (const companion of companions) {
        if (companionIds.has(companion.id) || ids.has(companion.id)) {
          throw new Error(`Studio ${label} companion id is repeated: ${companion.id}`);
        }
        companionIds.add(companion.id);
        ids.add(companion.id);
      }
    }
    const kind = new Map<string, "track" | "film" | "script">([
      ...tracks.map((item) => [item.id, "track"] as const),
      ...films.map((item) => [item.id, "film"] as const),
      ...scripts.map((item) => [item.id, "script"] as const),
    ]);
    const replacements = options.replace ?? {};
    for (const [target, replacement] of Object.entries(replacements)) {
      if (!ids.has(target)) throw new Error(`Studio companion replacement target does not exist: ${target}`);
      if (!ids.has(replacement)) throw new Error(`Studio companion replacement does not exist: ${replacement}`);
      if (target === replacement) throw new Error(`Studio companion cannot replace itself: ${target}`);
      if (kind.get(target) !== kind.get(replacement)) {
        throw new Error(`Studio companion replacement must keep its kind: ${target} -> ${replacement}`);
      }
    }
    this.#tracks = Object.freeze(tracks.filter((companion) => !(companion.id in replacements)));
    this.#films = Object.freeze(films.filter((film) => !(film.id in replacements)));
    this.#scripts = Object.freeze(scripts.filter((script) => !(script.id in replacements)));
  }

  filmCompanionFor(
    type: TypeRef,
    placement: Pick<Placement, "surface" | "module"> | undefined,
  ): StudioFilmCompanion | undefined {
    if (placement === undefined) return undefined;
    const found = this.#films.filter((companion) =>
      sameType(companion.match.outputType, type)
      && companion.match.surface === placement.surface
      && sameModule(companion.match.module, placement.module));
    if (found.length > 1) throw new Error(`Studio Film companions are ambiguous for ${placement.module.name}#${placement.surface}.`);
    return found[0];
  }

  scriptCompanionFor(module: ModuleRef, surface: string): StudioScriptCompanion | undefined {
    const found = this.#scripts.filter((companion) =>
      sameModule(companion.match.module, module) && companion.match.surface === surface);
    if (found.length > 1) throw new Error(`Studio Script companions are ambiguous for ${module.name}@${module.version}#${surface}.`);
    return found[0];
  }

  observeScript(
    module: ModuleRef,
    surface: string,
    input: Parameters<StudioScriptCompanion["observe"]>[0],
  ): StudioScriptSourceMap | undefined {
    const companion = this.scriptCompanionFor(module, surface);
    const found = companion?.observe(input);
    return companion === undefined || found === undefined
      ? undefined
      : { ...found, companion: companion.id };
  }

  adjustScript(input: {
    readonly companion: string;
    readonly sourceName: string;
    readonly source: string;
    readonly adjustment: StudioScriptAdjustment;
  }): string {
    const companion = this.#scripts.find((candidate) => candidate.id === input.companion);
    if (companion === undefined) throw new Error(`Studio Script companion ${input.companion} is unavailable.`);
    return companion.adjust({ sourceName: input.sourceName, source: input.source, adjustment: input.adjustment });
  }

  trackCompanionFor(
    type: TypeRef,
    placement: Pick<Placement, "surface" | "module"> | undefined,
    siblingTypes: readonly TypeRef[],
  ): StudioTrackCompanion | undefined {
    const candidates = this.#tracks
      .filter((companion) => matches(companion, type, placement, siblingTypes))
      .map((companion) => ({ companion, score: specificity(companion) }))
      .sort((left, right) => right.score - left.score || left.companion.id.localeCompare(right.companion.id));
    const best = candidates[0];
    if (best === undefined) return undefined;
    const tied = candidates.filter((candidate) => candidate.score === best.score);
    if (tied.length > 1) {
      throw new Error(`Studio Track Companions are ambiguous for ${type.module.name}@${type.module.version}#${type.name}: ${tied.map((candidate) => candidate.companion.id).join(", ")}`);
    }
    return best.companion;
  }

  classifyOutput(
    type: TypeRef,
    placement: Placement | undefined,
    siblingTypes: readonly TypeRef[],
  ): StudioViewRole | undefined {
    return this.trackCompanionFor(type, placement, siblingTypes)?.role;
  }

  requiredValuePorts(
    type: TypeRef,
    placement: Placement | undefined,
    siblingTypes: readonly TypeRef[],
  ): readonly string[] {
    return this.trackCompanionFor(type, placement, siblingTypes)?.requiredValues ?? [];
  }

  semanticTimelinePresentation(authoredLabel?: string): {
    readonly family: StudioTrackBinding["family"];
    readonly tone: StudioTrackBinding["tone"];
    readonly label?: string;
    readonly icon: StudioTrackBinding["icon"];
    readonly lane: StudioTrackBinding["lane"];
  } {
    const companion = this.trackCompanionFor(semanticTrackTypes.track, undefined, []);
    return {
      family: companion?.family ?? "semantic",
      tone: companion?.tone ?? "teal",
      ...(authoredLabel === undefined
        ? (companion?.label === undefined ? {} : { label: companion.label })
        : { label: authoredLabel }),
      icon: companion?.icon ?? "brand",
      lane: companion?.lane ?? flatLane,
    };
  }

  #trackCompanion(track: StudioResolvedTrack): StudioTrackCompanion & { readonly family: StudioTrackBinding["family"] } {
    const placement = track.trace.surface === undefined || track.trace.module === undefined
      ? undefined
      : { surface: track.trace.surface, module: track.trace.module };
    const siblingTypes = track.trace.outputPorts.flatMap((item) => item.typeRef === undefined ? [] : [item.typeRef]);
    const companion = this.trackCompanionFor(track.typeRef, placement, siblingTypes);
    const family = companion?.family;
    if (companion === undefined || family === undefined) {
      throw new Error(`Studio has no Track Companion for ${track.type} (${track.name}).`);
    }
    return { ...companion, family };
  }

  trackAttachments(track: StudioResolvedTrack): readonly StudioTrackBinding[] {
    const root = this.bindTrack(track);
    const companion = this.#trackCompanion(track);
    return (companion.attachments ?? []).map((attachment: StudioLaneAttachment) => ({
      family: attachment.family,
      tone: attachment.tone ?? companion.tone ?? "neutral",
      ...(attachment.label === undefined ? {} : { label: attachment.label }),
      facet: attachment.facet,
      groupId: root.groupId,
      icon: attachment.icon,
      companion: `${companion.id}:${attachment.id}`,
      attachmentId: attachment.id,
      lane: {
        ...attachment.lane,
        attachedTo: attachment.lane.attachedTo ?? root.lane.groupId ?? root.groupId,
      },
      references: root.references,
    }));
  }

  bindTrack(track: StudioResolvedTrack): StudioTrackBinding {
    const companion = this.#trackCompanion(track);
    // A Companion may provide a deliberate presentation label for a facet
    // (e.g. Speech Visual / Speech Audio). Authored ids remain the fallback
    // for ordinary user-named tracks.
    const label = companion.label ?? track.trace.authoredId;
    return {
      family: companion.family,
      tone: companion.tone ?? "neutral",
      ...(label === undefined ? {} : { label }),
      facet: sameType(track.typeRef, compositionTypes.audioTrack) ? "audio" : "visual",
      groupId: track.trace.authoredId ?? track.outputRef,
      icon: companion.icon ?? (sameType(track.typeRef, compositionTypes.audioTrack) ? "waveform" : "layers"),
      companion: companion.id,
      lane: companion.lane ?? flatLane,
      ...(track.trace.placement === undefined ? {} : { authoredTag: track.trace.placement }),
      references: track.trace.references.map(({ name, type }) => ({ name, type })),
    };
  }

  projectTrack(input: StudioTrackCompanionContext): readonly StudioEntityDraft[] {
    const companion = this.#trackCompanion(input.track);
    const drafts = companion.project?.(input) ?? input.generic();
    const preview = input.surfacePreview;
    const surfaceLayer: StudioEntityDraft["display"]["layers"][number] | undefined = preview === undefined
      ? undefined
      : { kind: "preview", role: "decoration", preview, layout: "repeat-x" };
    const projected: readonly StudioEntityDraft[] = companion.poster?.source !== "surface-preview" || surfaceLayer === undefined
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
    for (const draft of projected) validateDraftVocabulary(companion, draft);
    return projected;
  }

  bindingDeclarations(
    track: StudioResolvedTrack,
    placement: Placement | undefined,
    lane?: string,
  ) {
    const companion = this.#trackCompanion(track);
    if (lane !== undefined) {
      return companion.attachments?.find((attachment) => attachment.id === lane)?.bindings ?? [];
    }
    return companion.bindings ?? [];
  }

  inspectorDeclarations(
    track: StudioResolvedTrack,
    placement: Placement | undefined,
    lane?: string,
  ) {
    const companion = this.#trackCompanion(track);
    if (lane !== undefined) {
      return companion.attachments?.find((attachment) => attachment.id === lane)?.inspector ?? [];
    }
    return companion.inspector ?? [];
  }

}

export function sealStudioClip(
  outputRef: string,
  draft: StudioEntityDraft,
  fallback: StudioTrackBinding,
  editHandles: readonly StudioEditHandle[] = [],
  inspector: Clip["inspector"] = [],
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
    inspector,
    editHandles,
    renderIds: draft.renderIds ?? (draft.presentId === undefined ? [] : [draft.presentId]),
  };
}

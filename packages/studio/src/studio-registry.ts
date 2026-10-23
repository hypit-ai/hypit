import type {
  StudioTrackCompanion,
  StudioParameterCompanion,
  StudioTrackCompanionContext,
  StudioEditHandle,
  StudioItemDraft,
  StudioInspectorObjectDraft,
  StudioFilmCompanion,
  StudioLaneAttachment,
  StudioViewRole,
  StudioResolvedTrack,
  StudioTemporalDomainAdjustment,
  StudioTemporalDomainProjectionInput,
  StudioTemporalDomainCompanion,
  StudioTemporalDeclarationCompanion,
  StudioTemporalDeclarationDraft,
  StudioTemporalRelationCompanion,
  StudioTemporalDomainSourceMap,
  StudioSourceBindingDeclaration,
  StudioSpan,
} from "@hypit/studio-companion";
import { studioParameterControls } from "@hypit/studio-companion";
import { parameterOption } from "./parameter-values.js";
import { compositionTypes } from "@hypit/composition";
import { compareCodeUnits, sameModule, sameType } from "@hypit/hypit/protocol";
import type { ModuleRef, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

import type { Placement } from "./observe.js";
import type { StudioItem, StudioTrackBinding } from "./shared.js";

export type { StudioItemDraft, StudioViewRole, StudioSpan } from "@hypit/studio-companion";

const flatLane = {
  heightPx: 52,
};

const tones = new Set(["blue", "blue-muted", "green", "green-muted", "teal", "violet", "magenta", "magenta-muted", "orange", "orange-muted", "neutral"]);
const icons = new Set(["brand", "captions", "chart", "component", "layers", "text", "timeline", "video", "waveform"]);
const chromes = new Set(["standard", "group", "point", "compact"]);
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
    const choices = (field.options ?? []).map(parameterOption);
    if (choices.some(option => !option.label.trim() || !["string", "number", "boolean"].includes(typeof option.value)
      || typeof option.value === "number" && !Number.isFinite(option.value))
      || new Set(choices.map(option => JSON.stringify(option.value))).size !== choices.length) {
      throw new Error(`${subject} Inspector field ${field.binding} has invalid or repeated choices`);
    }
    const numeric = field.number;
    if (numeric !== undefined) {
      if (field.control !== "number" || numeric.scale !== undefined && (!Number.isFinite(numeric.scale) || numeric.scale <= 0)
        || numeric.step !== undefined && (!Number.isFinite(numeric.step) || numeric.step <= 0)
        || numeric.minimum !== undefined && !Number.isFinite(numeric.minimum)
        || numeric.maximum !== undefined && !Number.isFinite(numeric.maximum)
        || numeric.minimum !== undefined && numeric.maximum !== undefined && numeric.minimum > numeric.maximum
        || numeric.suffixes !== undefined && (numeric.suffixes.length === 0 || numeric.suffixes.some(suffix => !suffix.trim()))) {
        throw new Error(`${subject} Inspector field ${field.binding} has an invalid numeric presentation`);
      }
    }
    if (field.multiline && field.control !== "text") throw new Error(`${subject} multiline editing requires text`);
    if (field.swatches !== undefined && (field.control !== "color" || field.swatches.some(color => !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(color)))) {
      throw new Error(`${subject} color suggestions require hex colors`);
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
  const inspectorObjectIds = new Set<string>();
  for (const object of companion.inspectorObjects ?? []) {
    if (!object.id.trim() || inspectorObjectIds.has(object.id)) {
      throw new Error(`Studio Companion ${companion.id} has a duplicate or empty Inspector object id`);
    }
    inspectorObjectIds.add(object.id);
    if (!object.label.trim()) throw new Error(`Studio Companion ${companion.id} Inspector object ${object.id} has no label`);
    validateInspector(`Studio Companion ${companion.id} Inspector object ${object.id}`, object.bindings, object.inspector);
  }
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

function validateItemDraftVocabulary(companion: StudioTrackCompanion, draft: StudioItemDraft): void {
  if (draft.display === undefined || typeof draft.display.title !== "string" || draft.display.title.trim().length === 0) {
    throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has no display title`);
  }
  if (!Array.isArray(draft.display.layers)) {
    throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has invalid display layers`);
  }
  if (draft.presentation !== undefined
    && (!draft.presentation.kind.trim() || !chromes.has(draft.presentation.chrome))) {
    throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has invalid presentation`);
  }
  const terminalLinks = new Set<string>();
  for (const link of draft.terminalLinks ?? []) {
    const key = JSON.stringify([link.spanId, link.elementId]);
    if (!link.spanId.trim() || link.elementId !== undefined && !link.elementId.trim() || terminalLinks.has(key)) {
      throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has an invalid or repeated terminal link`);
    }
    terminalLinks.add(key);
  }
  for (const [index, layer] of draft.display.layers.entries()) {
    if (layer.kind === "text") {
      if (layer.role !== "content" || typeof layer.text !== "string") {
        throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has invalid text layer ${index}`);
      }
      continue;
    }
    if (layer.kind !== "preview" || (layer.role !== "content" && layer.role !== "decoration")
      || !layouts.has(layer.layout)
      || !(["image", "video", "audio"] as const).includes(layer.preview.kind)) {
      throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has invalid preview layer ${index}`);
    }
    const source = layer.preview.source;
    if (source.kind === "artifact") {
      if (typeof source.resource !== "string" || source.resource.length === 0) {
        throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has invalid Artifact source`);
      }
    } else if (source.kind !== "surface-preview"
      || source.module.length === 0 || source.version.length === 0 || source.surface.length === 0) {
      throw new Error(`Studio Track Companion ${companion.id} Item ${draft.id} has invalid Surface preview source`);
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
  readonly #parameters: readonly StudioParameterCompanion[];
  readonly #tracks: readonly StudioTrackCompanion[];
  readonly #films: readonly StudioFilmCompanion[];
  readonly #temporalDomains: readonly StudioTemporalDomainCompanion[];
  readonly #temporalDeclarations: readonly StudioTemporalDeclarationCompanion[];
  readonly #temporalRelations: readonly StudioTemporalRelationCompanion[];

  constructor(
    tracks: readonly StudioTrackCompanion[],
    options: {
      readonly films?: readonly StudioFilmCompanion[];
      readonly temporalDomains?: readonly StudioTemporalDomainCompanion[];
      readonly temporalDeclarations?: readonly StudioTemporalDeclarationCompanion[];
      readonly temporalRelations?: readonly StudioTemporalRelationCompanion[];
      readonly parameters?: readonly StudioParameterCompanion[];
    } = {},
  ) {
    const ids = new Set<string>();
    for (const companion of tracks) {
      if (ids.has(companion.id)) throw new Error(`Studio Track Companion id is repeated: ${companion.id}`);
      ids.add(companion.id);
      validateCompanionVocabulary(companion);
    }
    const films = [...(options.films ?? [])];
    const temporalDomains = [...(options.temporalDomains ?? [])];
    const temporalDeclarations = [...(options.temporalDeclarations ?? [])];
    const temporalRelations = [...(options.temporalRelations ?? [])];
    for (const [label, companions] of [["Film", films], ["Temporal Domain", temporalDomains],
      ["Temporal Declaration", temporalDeclarations], ["Temporal Relation", temporalRelations]] as const) {
      const companionIds = new Set<string>();
      for (const companion of companions) {
        if (companionIds.has(companion.id) || ids.has(companion.id)) {
          throw new Error(`Studio ${label} companion id is repeated: ${companion.id}`);
        }
        companionIds.add(companion.id);
        ids.add(companion.id);
      }
    }
    this.#parameters = Object.freeze([...(options.parameters ?? [])]);
    for (const companion of this.#parameters) {
      if (ids.has(companion.id)) throw new Error(`Studio Parameter Companion id is repeated: ${companion.id}`);
      ids.add(companion.id);
      validateInspector(`Studio Parameter Companion ${companion.id}`, companion.bindings, companion.inspector);
    }
    this.#tracks = Object.freeze([...tracks]);
    this.#films = Object.freeze(films);
    this.#temporalDomains = Object.freeze(temporalDomains);
    this.#temporalDeclarations = Object.freeze(temporalDeclarations);
    this.#temporalRelations = Object.freeze(temporalRelations);
  }

  temporalRelationFor(producer: ProducerRef, output: string): StudioTemporalRelationCompanion | undefined {
    const found = this.#temporalRelations.filter((companion) =>
      sameModule(companion.match.producer.module, producer.module)
      && companion.match.producer.name === producer.name
      && companion.match.output === output);
    if (found.length > 1) {
      throw new Error(`Studio Temporal Relation companions are ambiguous for ${producer.module.name}@${producer.module.version}#${producer.name}.${output}.`);
    }
    return found[0];
  }

  parameterCompanionFor(module: ModuleRef, surface: string): StudioParameterCompanion | undefined {
    const found = this.#parameters.filter(companion => sameModule(companion.match.module, module) && companion.match.surface === surface);
    if (found.length > 1) throw new Error(`Studio Parameter companions are ambiguous for ${module.name}#${surface}.`);
    return found[0];
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

  temporalDomainCompanionFor(module: ModuleRef, surface: string): StudioTemporalDomainCompanion | undefined {
    const found = this.#temporalDomains.filter((companion) =>
      sameModule(companion.match.module, module) && companion.match.surface === surface);
    if (found.length > 1) throw new Error(`Studio Temporal Domain companions are ambiguous for ${module.name}@${module.version}#${surface}.`);
    return found[0];
  }

  observeTemporalDomain(
    module: ModuleRef,
    surface: string,
    input: Parameters<StudioTemporalDomainCompanion["observe"]>[0],
  ): StudioTemporalDomainSourceMap | undefined {
    const companion = this.temporalDomainCompanionFor(module, surface);
    const found = companion?.observe(input);
    return companion === undefined || found === undefined
      ? undefined
      : { ...found, companion: companion.id };
  }

  projectTemporalDomain(input: StudioTemporalDomainProjectionInput) {
    const companion = this.#temporalDomains.find(item => item.id === input.source.companion);
    if (companion === undefined) throw new Error(`Temporal Domain Companion ${input.source.companion} is unavailable.`);
    return companion.project(input);
  }

  projectTemporalDeclarations(placement: Placement): readonly StudioTemporalDeclarationDraft[] {
    const found = this.#temporalDeclarations.filter((companion) =>
      sameModule(companion.match.module, placement.module) && companion.match.surface === placement.surface);
    if (found.length > 1) {
      throw new Error(`Studio Temporal Declaration companions are ambiguous for ${placement.module.name}@${placement.module.version}#${placement.surface}.`);
    }
    return found[0]?.project({ placement }) ?? [];
  }

  adjustTemporalDomain(input: {
    readonly companion: string;
    readonly sourceName: string;
    readonly source: string;
    readonly adjustment: StudioTemporalDomainAdjustment;
  }): string {
    const companion = this.#temporalDomains.find((candidate) => candidate.id === input.companion);
    if (companion === undefined) throw new Error(`Studio Temporal Domain companion ${input.companion} is unavailable.`);
    return companion.adjust({ sourceName: input.sourceName, source: input.source, adjustment: input.adjustment });
  }

  temporalDomainValueTypes(): readonly TypeRef[] {
    return this.#temporalDomains.flatMap((companion) => companion.valueTypes);
  }

  identifyTemporalSource(type: TypeRef, value: unknown): { readonly companion: string; readonly id: string; readonly kind: string; readonly itemId: string } | undefined {
    const candidates = this.#temporalDomains.filter((companion) => companion.sourceTypes.some((sourceType) => sameType(sourceType, type)))
      .flatMap((companion) => {
        const found = companion.identify({ type, value });
        return found === undefined ? [] : [{ companion: companion.id, id: found.domainId, kind: found.kind, itemId: found.id }];
      });
    if (candidates.length > 1) throw new Error(`Studio Temporal Domain source is ambiguous for ${type.module.name}@${type.module.version}#${type.name}.`);
    return candidates[0];
  }

  temporalDomainPresentation(companionId: string) {
    const companion = this.#temporalDomains.find((candidate) => candidate.id === companionId);
    if (companion === undefined) throw new Error(`Studio Temporal Domain companion ${companionId} is unavailable.`);
    return companion.presentation;
  }

  trackCompanionFor(
    type: TypeRef,
    placement: Pick<Placement, "surface" | "module"> | undefined,
    siblingTypes: readonly TypeRef[],
  ): StudioTrackCompanion | undefined {
    const candidates = this.#tracks
      .filter((companion) => matches(companion, type, placement, siblingTypes))
      .map((companion) => ({ companion, score: specificity(companion) }))
      .sort((left, right) => right.score - left.score || compareCodeUnits(left.companion.id, right.companion.id));
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
    }));
  }

  bindTrack(track: StudioResolvedTrack): StudioTrackBinding {
    const companion = this.#trackCompanion(track);
    // A Companion may provide a deliberate presentation label for a facet
    // (e.g. a component’s picture and sound outputs). Authored ids remain the fallback
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
    };
  }

  projectTrack(input: StudioTrackCompanionContext): readonly StudioItemDraft[] {
    const companion = this.#trackCompanion(input.track);
    const drafts = companion.project?.(input) ?? input.generic();
    const preview = input.surfacePreview;
    const surfaceLayer: StudioItemDraft["display"]["layers"][number] | undefined = preview === undefined
      ? undefined
      : { kind: "preview", role: "decoration", preview, layout: "repeat-x" };
    const projected: readonly StudioItemDraft[] = companion.poster?.source !== "surface-preview" || surfaceLayer === undefined
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
    const localIds = new Set<string>();
    for (const draft of projected) {
      validateItemDraftVocabulary(companion, draft);
      const key = JSON.stringify([draft.lane ?? null, draft.id]);
      if (!draft.id.trim() || localIds.has(key)) {
        throw new Error(`Studio Companion ${companion.id} repeats Item ${draft.id} in one lane.`);
      }
      localIds.add(key);
    }
    return projected;
  }

  projectInspectorObjects(input: StudioTrackCompanionContext): readonly {
    readonly companionId: string;
    readonly label: string;
    readonly draft: StudioInspectorObjectDraft;
    readonly bindings: readonly StudioSourceBindingDeclaration[];
    readonly inspector: NonNullable<StudioTrackCompanion["inspector"]>;
  }[] {
    const companion = this.#trackCompanion(input.track);
    const result = (companion.inspectorObjects ?? []).flatMap((object) => object.project(input).map((draft) => ({
      companionId: object.id,
      label: object.label,
      draft,
      bindings: object.bindings ?? [],
      inspector: object.inspector ?? [],
    })));
    const ids = new Set<string>();
    for (const { draft } of result) {
      if (!draft.id.trim() || ids.has(draft.id)) throw new Error(`Studio Companion ${companion.id} repeats Inspector object ${draft.id}`);
      if (!draft.authoredId.trim() || !draft.title.trim()) throw new Error(`Studio Companion ${companion.id} Inspector object ${draft.id} is incomplete`);
      ids.add(draft.id);
    }
    return result;
  }

  bindingDeclarations(
    track: StudioResolvedTrack,
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
    lane?: string,
  ) {
    const companion = this.#trackCompanion(track);
    if (lane !== undefined) {
      return companion.attachments?.find((attachment) => attachment.id === lane)?.inspector ?? [];
    }
    return companion.inspector ?? [];
  }

}

export function sealStudioItem(
  outputRef: string,
  lane: string | undefined,
  draft: StudioItemDraft,
  fallback: StudioTrackBinding,
  terminalTargets: StudioItem["terminalTargets"] = [],
  editHandles: readonly StudioEditHandle[] = [],
  inspector: StudioItem["inspector"] = [],
): StudioItem {
  return {
    id: JSON.stringify(["item", outputRef, lane ?? null, draft.id]),
    authoredId: draft.authoredId,
    ...(draft.marker === undefined ? {} : { marker: draft.marker }),
    display: draft.display,
    startFrame: draft.startFrame,
    endFrameExclusive: draft.endFrameExclusive,
    ...(draft.elementLocation === undefined ? {} : { elementLocation: draft.elementLocation }),
    stackOrder: draft.stackOrder,
    presentation: draft.presentation ?? {
      kind: fallback.facet === "audio" ? "audio-clip" : "present",
      chrome: "standard",
    },
    ...(draft.temporal === undefined ? {} : { temporal: draft.temporal }),
    inspector,
    editHandles,
    terminalTargets,
  };
}

import {
  declarationField,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorResolvedReference,
} from "@hypit/hypit/author";
import { sameType, type TypeRef } from "@hypit/hypit/protocol";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { compositionTypes, type AudioReconstructionProgram } from "@hypit/composition";
import { mediaTypes } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import {
  assertTemporalRelationSpec,
  parseTemporalCubicRelationFields,
  parseTemporalDuration,
  parseTemporalRelationFields,
  temporalCubicRelationFieldNames,
  temporalRelationFieldNames,
  temporalTypes,
  type TemporalCubicRelationLiteralFields,
  type TemporalRelationLiteralFields,
  type TemporalRelationSpec,
} from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";
import {
  decodeMediaFit,
  decodeMediaSampleAppearance,
  decodeVisualClipSpec,
  sealVisualTrackHeader,
  visualMaterialKeys,
} from "@hypit/visual-track";
import { audioTrackTypes } from "@hypit/audio-track";

import { compositionAudioFragment, compositionOccurrenceFragment, compositionVisualFragment } from "./fragment.js";
import { compositionClipModuleRef, compositionClipTypes } from "./manifest.js";
import type { CompositionAudioUse, CompositionOccurrenceSpec, CompositionVisualUseSpec } from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;
type ValueRef = AuthorResolvedReference["ref"] | { readonly kind: "record"; readonly id: string };

function field(node: DeclarationNode, name: string) {
  return declarationField(node, name);
}

function literal(node: DeclarationNode, name: string, fallback?: string): string {
  const value = field(node, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value?.kind !== "literal" || value.value.trim().length === 0) {
    throw new Error(`${node.name}.${name} must be non-empty text.`);
  }
  return value.value.trim();
}

function numeric(node: DeclarationNode, name: string, fallback: number): number {
  const value = Number(literal(node, name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`${node.name}.${name} must be a finite number.`);
  return value;
}

async function resolved(
  node: DeclarationNode,
  name: string,
  type: TypeRef,
  resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const value = field(node, name);
  if (value?.kind !== "reference") throw new Error(`${node.name}.${name} must be a reference.`);
  const reference = await resolveReference(value.path);
  if (reference === undefined || !sameType(reference.type, type)) throw new Error(`${node.name}.${name} has the wrong Type.`);
  return reference;
}

function authoredValue<T>(reference: AuthorResolvedReference, label: string): T {
  if (reference.record === undefined) throw new Error(`${label} must reference an authored Record.`);
  return reference.record.value as unknown as T;
}

function binding(component: string, output: string, name: string, type: TypeRef): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component, output }, type };
}

function relation(child: AuthorDeclarationChild) {
  if (child.name === "Curve") {
    const fields = Object.fromEntries(temporalCubicRelationFieldNames
      .filter((name) => field(child, name) !== undefined).map((name) => [name, literal(child, name)]));
    return parseTemporalCubicRelationFields(fields as TemporalCubicRelationLiteralFields, child.name);
  }
  const fields: Partial<Record<typeof temporalRelationFieldNames[number], string>> = {};
  for (const name of temporalRelationFieldNames) if (field(child, name) !== undefined) fields[name] = literal(child, name);
  return parseTemporalRelationFields(fields as TemporalRelationLiteralFields, child.name);
}

const relationFields = temporalRelationFieldNames.map((name) => ({
  name, kind: "literal" as const, required: false, summary: `Supplies the exact Temporal Map ${name} parameter.`,
}));
const curveFields = temporalCubicRelationFieldNames.map((name) => ({
  name, kind: "literal" as const, required: name.startsWith("source-"),
  summary: `Supplies the exact cubic Temporal Map ${name} position.`,
}));

export const compositionOccurrenceAuthorDeclaration: AuthorDeclarationCompiler = {
  module: compositionClipModuleRef,
  declaration: "occurrence",
  outputs: [compositionClipTypes.occurrenceSpec, compositionClipTypes.occurrence],
  shape: {
    summary: "Places one closed child Composition on a parent Timeline with one shared temporal relation.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names this Composition occurrence." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the parent Timeline." },
      { name: "source", kind: "reference", required: true, accepts: [compositionTypes.composition], summary: "Selects the closed child Composition." },
      { name: "during", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Selects the parent Window occupied by this occurrence." },
    ],
    children: [
      { name: "Map", cardinality: "many", summary: "Adds one exact target-to-child temporal relation.", fields: relationFields },
      { name: "Curve", cardinality: "many", summary: "Adds one exact monotone cubic source-position relation.", fields: curveFields },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [binding(id, "occurrence", `${id}.occurrence`, compositionClipTypes.occurrence)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const source = await resolved(declaration, "source", compositionTypes.composition, resolveReference);
    const window = await resolved(declaration, "during", temporalTypes.window, resolveReference);
    const sampling: TemporalRelationSpec | undefined = declaration.children.length === 0
      ? undefined : { relations: declaration.children.map(relation) };
    if (sampling !== undefined) assertTemporalRelationSpec(sampling);
    const spec: CompositionOccurrenceSpec = { id, ...(sampling === undefined ? {} : { sampling }) };
    const specId = `${id}.spec`;
    return {
      records: [{ id: specId, type: compositionClipTypes.occurrenceSpec, value: spec as never, range: declaration.range }],
      components: [{
        id, fragment: compositionOccurrenceFragment,
        inputs: { timeline: timeline.ref, source: source.ref, window: window.ref, spec: { kind: "record", id: specId } },
        outputs: { occurrence: `${id}.occurrence` }, range: declaration.range,
      }],
    };
  },
};

function selectedRecipe(reference: AuthorResolvedReference | undefined, id: string): Recipe {
  return reference === undefined ? { path: `${id}:default`, properties: {} } : authoredValue<Recipe>(reference, "Visual.treatment");
}

function recipePart(recipe: Recipe, keys: readonly string[], suffix: string): Recipe {
  return {
    path: `${recipe.path}:${suffix}`,
    properties: Object.fromEntries(Object.entries(recipe.properties).filter(([name]) => keys.includes(name))),
  };
}

export const compositionVisualAuthorDeclaration: AuthorDeclarationCompiler = {
  module: compositionClipModuleRef,
  declaration: "visual",
  outputs: [compositionClipTypes.visualUseSpec, compositionTypes.visualTrack],
  shape: {
    summary: "Projects one Composition occurrence as an ordinary Visual Track.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the resulting Visual Track." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the parent Timeline." },
      { name: "picture", kind: "reference", required: true, accepts: [mediaTypes.workingPicture], summary: "Selects the parent working-picture environment." },
      { name: "occurrence", kind: "reference", required: true, accepts: [compositionClipTypes.occurrence], summary: "Selects the shared Composition occurrence." },
      { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Places the child picture in the parent canvas." },
      { name: "treatment", kind: "reference", required: false, accepts: [recipeType], summary: "Optionally styles fitting, sampling and the outer frame." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [binding(id, "visual", `${id}.visual`, compositionTypes.visualTrack)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const picture = await resolved(declaration, "picture", mediaTypes.workingPicture, resolveReference);
    const occurrence = await resolved(declaration, "occurrence", compositionClipTypes.occurrence, resolveReference);
    const frame = await resolved(declaration, "frame", spatialTypes.frame, resolveReference);
    const treatmentRef = field(declaration, "treatment") === undefined
      ? undefined : await resolved(declaration, "treatment", recipeType, resolveReference);
    const treatment = selectedRecipe(treatmentRef, id);
    const allowed = [...visualMaterialKeys.fit, ...visualMaterialKeys.sample,
      ...visualMaterialKeys.frame.filter((name) => name !== "frame-paint")];
    const unknown = Object.keys(treatment.properties).filter((name) => !allowed.includes(name as never));
    if (unknown.length > 0) throw new Error(`Visual.treatment does not apply ${unknown.join(", ")} to a nested Composition.`);
    const spec: CompositionVisualUseSpec = {
      header: sealVisualTrackHeader({ id }),
      fit: decodeMediaFit(recipePart(treatment, visualMaterialKeys.fit, "fit")),
      appearance: decodeMediaSampleAppearance(recipePart(treatment, visualMaterialKeys.sample, "sample")),
      clip: decodeVisualClipSpec(recipePart(treatment,
        visualMaterialKeys.frame.filter((name) => name !== "frame-paint"), "frame"), { id: `${id}:clip` }),
    };
    const specId = `${id}.spec`;
    const inputs: Record<string, ValueRef> = {
      timeline: timeline.ref, picture: picture.ref, occurrence: occurrence.ref, frame: frame.ref,
      spec: { kind: "record", id: specId },
    };
    return {
      records: [{ id: specId, type: compositionClipTypes.visualUseSpec, value: spec as never, range: declaration.range }],
      components: [{ id, fragment: compositionVisualFragment, inputs, outputs: { visual: `${id}.visual` }, range: declaration.range }],
    };
  },
};

export const compositionAudioAuthorDeclaration: AuthorDeclarationCompiler = {
  module: compositionClipModuleRef,
  declaration: "audio",
  outputs: [compositionClipTypes.audioUse, compositionTypes.audioTrack],
  shape: {
    summary: "Projects one Composition occurrence as an ordinary Audio Track in the fixed 48 kHz stereo environment.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the resulting Audio Track." },
      { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects the parent Timeline." },
      { name: "occurrence", kind: "reference", required: true, accepts: [compositionClipTypes.occurrence], summary: "Selects the shared Composition occurrence." },
      { name: "reconstruction", kind: "reference", required: false, accepts: [audioTrackTypes.reconstruction], summary: "Explicitly selects signal reconstruction." },
      { name: "gain", kind: "literal", required: false, fallback: 1, summary: "Supplies linear gain." },
      { name: "fade-in", kind: "literal", required: false, fallback: "0f", summary: "Supplies an exact fade-in duration." },
      { name: "fade-out", kind: "literal", required: false, fallback: "0f", summary: "Supplies an exact fade-out duration." },
    ],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [binding(id, "audio", `${id}.audio`, compositionTypes.audioTrack)];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const occurrence = await resolved(declaration, "occurrence", compositionClipTypes.occurrence, resolveReference);
    const reconstructionRef = field(declaration, "reconstruction") === undefined
      ? undefined : await resolved(declaration, "reconstruction", audioTrackTypes.reconstruction, resolveReference);
    const use: CompositionAudioUse = {
      id,
      gain: numeric(declaration, "gain", 1),
      fadeIn: parseTemporalDuration(literal(declaration, "fade-in", "0f"), "Audio.fade-in"),
      fadeOut: parseTemporalDuration(literal(declaration, "fade-out", "0f"), "Audio.fade-out"),
      ...(reconstructionRef === undefined ? {} : {
        reconstruction: authoredValue<AudioReconstructionProgram>(reconstructionRef, "Audio.reconstruction"),
      }),
    };
    const useId = `${id}.use`;
    return {
      records: [{ id: useId, type: compositionClipTypes.audioUse, value: use as never, range: declaration.range }],
      components: [{
        id, fragment: compositionAudioFragment,
        inputs: { timeline: timeline.ref, occurrence: occurrence.ref, use: { kind: "record", id: useId } },
        outputs: { audio: `${id}.audio` }, range: declaration.range,
      }],
    };
  },
};

export const compositionClipAuthorDeclarations = [
  compositionOccurrenceAuthorDeclaration,
  compositionVisualAuthorDeclaration,
  compositionAudioAuthorDeclaration,
] as const;

export const compositionClipMarkupDeclarations = [
  { name: "occurrence", tag: "Occurrence" },
  { name: "visual", tag: "Visual" },
  { name: "audio", tag: "Audio" },
] as const;

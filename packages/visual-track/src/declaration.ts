import {
  declarationField,
  sealGraphFragment,
  type AuthorDeclaration,
  type AuthorDeclarationBinding,
  type AuthorDeclarationChild,
  type AuthorDeclarationCompiler,
  type AuthorRecordDraft,
  type AuthorResolvedReference,
  type FragmentOperation,
} from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes, pictureInterpretationProfile } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import {
  assertTemporalRelationSpec,
  parseTemporalCubicRelationFields,
  parseTemporalRelationFields,
  temporalCubicRelationFieldNames,
  temporalRelationFieldNames,
  temporalTypes,
  type TemporalRelationLiteralFields,
  type TemporalCubicRelationLiteralFields,
  type TemporalRelationSpec,
} from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";
import {
  decodeMediaFit,
  decodeMediaFramePaint,
  decodeMediaSampleSpec,
  decodeVisualClipSpec,
} from "./author.js";
import { visualTrackModuleRef, visualTrackProducers, visualTrackTypes } from "./manifest.js";
import { sealVisualClipMotion } from "./motion.js";
import { sealVisualTrackHeader } from "./program.js";
import type { MediaSamplingMotion, VisualClipMotion, VisualMotionPosition, VisualTransitionSpec } from "./types.js";

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
  const value = field(node, name);
  if (value === undefined) return fallback;
  const number = Number(value.kind === "literal" ? value.value : Number.NaN);
  if (!Number.isFinite(number)) throw new Error(`${node.name}.${name} must be a finite number.`);
  return number;
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

function recipe(reference: AuthorResolvedReference, label: string): Recipe {
  if (!sameType(reference.type, recipeType) || reference.record === undefined) {
    throw new Error(`${label} must be an authored Recipe.`);
  }
  return reference.record.value as unknown as Recipe;
}

function authoredValue<T>(reference: AuthorResolvedReference, label: string): T {
  if (reference.record === undefined) throw new Error(`${label} must reference an authored Record.`);
  return reference.record.value as unknown as T;
}

const FIT_FIELDS = ["fit", "frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y", "fit-constraint"] as const;
const NUMERIC_FIT_FIELDS = new Set<string>(["frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y"]);

function sourceRecipe(node: DeclarationNode, treatment: Recipe): Recipe {
  const properties: Record<string, CanonicalValue> = { ...treatment.properties };
  for (const name of FIT_FIELDS) {
    if (field(node, name) !== undefined) {
      const value = literal(node, name);
      properties[name] = NUMERIC_FIT_FIELDS.has(name) ? Number(value) : value;
    }
  }
  return { path: `${treatment.path}:source`, properties };
}

function motionPosition(node: DeclarationNode): VisualMotionPosition {
  const source = literal(node, "at");
  if (source === "start") return { kind: "start", offsetFrames: 0 };
  if (source === "end") return { kind: "end", offsetFrames: 0 };
  const percentage = /^(\d+(?:\.\d+)?)%$/u.exec(source);
  if (percentage !== null) return { kind: "progress", value: Number(percentage[1]) / 100 };
  const fromStart = /^(?:start\+)?(\d+)f$/u.exec(source);
  if (fromStart !== null) return { kind: "start", offsetFrames: Number(fromStart[1]) };
  const fromEnd = /^end-(\d+)f$/u.exec(source);
  if (fromEnd !== null) return { kind: "end", offsetFrames: -Number(fromEnd[1]) };
  throw new Error(`${node.name}.at must be start, end, a percentage, an exact frame from start, or end-Nf.`);
}

export function decodeVisualPoseKeyframe(node: AuthorDeclarationChild): VisualClipMotion["keyframes"][number] {
  const uniform = field(node, "scale") === undefined ? undefined : numeric(node, "scale", 1);
  if (uniform !== undefined && (field(node, "scale-x") !== undefined || field(node, "scale-y") !== undefined)) {
    throw new Error(`${node.name}.scale cannot be combined with scale-x or scale-y.`);
  }
  const easing = field(node, "easing") === undefined ? undefined : literal(node, "easing");
  return {
    at: motionPosition(node), translateX: numeric(node, "x", 0), translateY: numeric(node, "y", 0),
    scaleX: uniform ?? numeric(node, "scale-x", 1), scaleY: uniform ?? numeric(node, "scale-y", 1),
    rotationDeg: numeric(node, "rotate", 0), opacity: numeric(node, "opacity", 1),
    originX: numeric(node, "origin-x", 0.5), originY: numeric(node, "origin-y", 0.5),
    ...(easing === undefined ? {} : { easing: easing as "linear" | "ease-in" | "ease-out" | "ease-in-out" }),
  };
}

function inlineMotion(node: DeclarationNode): VisualClipMotion | undefined {
  const poses = node.children.filter((child) => child.name === "Pose");
  return poses.length === 0 ? undefined : sealVisualClipMotion({ keyframes: poses.map(decodeVisualPoseKeyframe) });
}

export function decodeMediaSamplingKeyframe(node: AuthorDeclarationChild): MediaSamplingMotion["keyframes"][number] {
  const at = literal(node, "at");
  const percentage = /^(\d+(?:\.\d+)?)%$/u.exec(at);
  const atProgress = at === "start" ? 0 : at === "end" ? 1 : percentage === null ? Number.NaN : Number(percentage[1]) / 100;
  if (!Number.isFinite(atProgress) || atProgress < 0 || atProgress > 1) {
    throw new Error(`${node.name}.at must be start, end or a percentage inside 0%..100%.`);
  }
  const easing = field(node, "easing") === undefined ? undefined : literal(node, "easing");
  return {
    atProgress, zoom: numeric(node, "zoom", 1), offsetX: numeric(node, "x", 0),
    offsetY: numeric(node, "y", 0), rotationDeg: numeric(node, "rotate", 0),
    ...(easing === undefined ? {} : { easing: easing as "linear" | "ease-in" | "ease-out" | "ease-in-out" }),
  };
}

function samplingMotion(node: DeclarationNode): MediaSamplingMotion | undefined {
  const keyframes = node.children.filter((child) => child.name === "Sampling").map(decodeMediaSamplingKeyframe);
  return keyframes.length === 0 ? undefined : { keyframes };
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

function samplingRelation(node: DeclarationNode): TemporalRelationSpec | undefined {
  const maps = node.children.filter((child) => child.name === "Map" || child.name === "Curve");
  if (maps.length === 0) return undefined;
  const result = { relations: maps.map(relation) };
  assertTemporalRelationSpec(result);
  return result;
}

type FragmentLayer =
  | { readonly kind: "paint"; readonly specName: string }
  | { readonly kind: "still"; readonly sourceName: string; readonly pictureName: string; readonly extentName: string; readonly placementKind: "fit" | "mapping"; readonly placementName: string; readonly specName: string }
  | { readonly kind: "timed" | "surface"; readonly sourceName: string; readonly placementKind: "fit" | "mapping"; readonly placementName: string; readonly specName: string };

type FragmentClip = {
  readonly suffix: string; readonly windowName: string; readonly frameName: string; readonly specName: string;
  readonly clipPathName?: string; readonly motionName?: string; readonly layers: readonly FragmentLayer[];
};

type FragmentTransition = {
  readonly suffix: string;
  readonly specName: string;
};

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function appendLayers(operations: FragmentOperation[], prefix: string, layers: readonly FragmentLayer[]): string {
  const emptyId = `${prefix}:layers:empty`;
  operations.push({ id: emptyId, producer: visualTrackProducers.createLayers, inputs: {}, result: { kind: "output", name: "layers" } });
  let current = emptyId;
  for (const [index, layer] of layers.entries()) {
    const id = `${prefix}:layers:${String(index + 1).padStart(4, "0")}`;
    const common = { layers: operation(current), spec: input(layer.specName) };
    if (layer.kind === "paint") {
      operations.push({ id, producer: visualTrackProducers.appendPaintLayer, inputs: common, result: { kind: "output", name: "layers" } });
    } else if (layer.kind === "still") {
      operations.push({ id, producer: layer.placementKind === "fit" ? visualTrackProducers.appendStillLayer : visualTrackProducers.appendMappedStillLayer,
        inputs: { ...common, source: input(layer.sourceName), picture: input(layer.pictureName), extent: input(layer.extentName), [layer.placementKind === "fit" ? "fit" : "mapping"]: input(layer.placementName) },
        result: { kind: "output", name: "layers" } });
    } else {
      const producer = layer.kind === "timed"
        ? layer.placementKind === "fit" ? visualTrackProducers.appendTimedLayer : visualTrackProducers.appendMappedTimedLayer
        : layer.placementKind === "fit" ? visualTrackProducers.appendSurfaceLayer : visualTrackProducers.appendMappedSurfaceLayer;
      operations.push({ id, producer,
        inputs: { ...common, ...(layer.kind === "timed" ? { media: input(layer.sourceName) } : { source: input(layer.sourceName) }), [layer.placementKind === "fit" ? "fit" : "mapping"]: input(layer.placementName) },
        result: { kind: "output", name: "layers" } });
    }
    current = id;
  }
  return current;
}

export function createVisualTrackFragment(
  inputTypes: readonly { readonly name: string; readonly type: TypeRef }[],
  clips: readonly FragmentClip[],
  transitions: readonly FragmentTransition[] = [],
) {
  const operations: FragmentOperation[] = [{ id: "track:set:empty", producer: visualTrackProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } }];
  let set = "track:set:empty";
  for (const clip of clips) {
    const prefix = `clip:${clip.suffix}`;
    const layers = appendLayers(operations, prefix, clip.layers);
    let spec: FragmentOperation["inputs"][string] = input(clip.specName);
    if (clip.clipPathName !== undefined) {
      const id = `${prefix}:bind-clip-path`;
      operations.push({ id, producer: visualTrackProducers.bindClipPath, inputs: { spec, path: input(clip.clipPathName) }, result: { kind: "output", name: "spec" } });
      spec = operation(id);
    }
    if (clip.motionName !== undefined) {
      const id = `${prefix}:bind-motion`;
      operations.push({ id, producer: visualTrackProducers.bindMotion, inputs: { spec, motion: input(clip.motionName) }, result: { kind: "output", name: "spec" } });
      spec = operation(id);
    }
    const id = `${prefix}:append`;
    operations.push({ id, producer: visualTrackProducers.appendClip,
      inputs: { set: operation(set), header: input("header"), timeline: input("timeline"), layers: operation(layers), frame: input(clip.frameName), spec, window: input(clip.windowName) },
      result: { kind: "output", name: "set" } });
    set = id;
  }
  for (const transition of transitions) {
    const id = `transition:${transition.suffix}:append`;
    operations.push({
      id,
      producer: visualTrackProducers.appendTransition,
      inputs: {
        set: operation(set),
        spec: input(transition.specName),
      },
      result: { kind: "output", name: "set" },
    });
    set = id;
  }
  operations.push(
    { id: "track:finalize", producer: visualTrackProducers.finalize, inputs: { set: operation(set), header: input("header"), timeline: input("timeline") }, result: { kind: "output", name: "program" } },
    { id: "track:visual", producer: visualTrackProducers.projectVisual, inputs: { timeline: input("timeline"), program: operation("track:finalize") }, result: { kind: "output", name: "track" } },
  );
  return sealGraphFragment({ inputs: inputTypes, operations, exports: [
    { name: "program", type: visualTrackTypes.program, root: operation("track:finalize") },
    { name: "visual", type: compositionTypes.visualTrack, root: operation("track:visual") },
  ] });
}

type BuildState = {
  readonly records: AuthorRecordDraft[]; readonly inputs: Record<string, ValueRef>;
  readonly inputTypes: { readonly name: string; readonly type: TypeRef }[];
  addReference(name: string, value: AuthorResolvedReference): void;
  addRecord(name: string, id: string, type: TypeRef, value: unknown, range: AuthorDeclaration["range"]): void;
};

function buildState(): BuildState {
  const records: AuthorRecordDraft[] = [], inputs: Record<string, ValueRef> = {};
  const inputTypes: { name: string; type: TypeRef }[] = [];
  function reserve(name: string, type: TypeRef, value: ValueRef): void {
    if (inputs[name] !== undefined) throw new Error(`Visual Track repeats input ${name}.`);
    inputs[name] = value; inputTypes.push({ name, type });
  }
  return { records, inputs, inputTypes,
    addReference(name, value) { reserve(name, value.type, value.ref); },
    addRecord(name, id, type, value, range) { records.push({ id, type, value: value as never, range }); reserve(name, type, { kind: "record", id }); },
  };
}

type DeclaredVisualSource =
  | { readonly kind: "image"; readonly value: AuthorResolvedReference; readonly extent: AuthorResolvedReference }
  | { readonly kind: "media"; readonly value: AuthorResolvedReference }
  | { readonly kind: "surface"; readonly value: AuthorResolvedReference };

async function declaredVisualSource(node: DeclarationNode, resolveReference: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined): Promise<DeclaredVisualSource> {
  const present = (["image", "media", "surface"] as const).filter((name) => field(node, name) !== undefined);
  if (present.length !== 1) throw new Error(`${node.name} requires exactly one of image, media or surface.`);
  const kind = present[0]!;
  if (kind === "image") return { kind, value: await resolved(node, "image", blobTypes.blob, resolveReference), extent: await resolved(node, "extent", spatialTypes.extent, resolveReference) };
  if (field(node, "extent") !== undefined) throw new Error(`${node.name}.extent is only valid with image.`);
  return kind === "media" ? { kind, value: await resolved(node, "media", mediaTypes.prepared, resolveReference) }
    : { kind, value: await resolved(node, "surface", mediaTypes.compositableSurface, resolveReference) };
}

function outputBinding(component: string, output: "program" | "visual", type: TypeRef): AuthorDeclarationBinding {
  return { name: `${component}.${output}`, ref: { kind: "component-output", component, output }, type };
}

const poseFields = [
  { name: "at", kind: "literal" as const, required: true, summary: "Places this state on the Clip-local clock." },
  ...["x", "y", "scale", "scale-x", "scale-y", "rotate", "opacity", "origin-x", "origin-y"].map((name) => ({ name, kind: "literal" as const, required: false, summary: `Supplies the Pose ${name} parameter.` })),
  { name: "easing", kind: "literal" as const, required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], summary: "Shapes the interval leaving this Pose." },
] as const;
const samplingFields = [
  { name: "at", kind: "literal" as const, required: true, summary: "Places this crop state on normalized Clip progress." },
  ...["zoom", "x", "y", "rotate"].map((name) => ({ name, kind: "literal" as const, required: false, summary: `Supplies the Sampling ${name} parameter.` })),
  { name: "easing", kind: "literal" as const, required: false, values: ["linear", "ease-in", "ease-out", "ease-in-out"], summary: "Shapes the interval leaving this Sampling state." },
] as const;
const relationFields = temporalRelationFieldNames.map((name) => ({ name, kind: "literal" as const, required: false, summary: `Supplies the exact Temporal Map ${name} parameter.` }));
const curveFields = temporalCubicRelationFieldNames.map((name) => ({ name, kind: "literal" as const,
  required: name.startsWith("source-"), summary: `Supplies the exact cubic Temporal Map ${name} position.` }));

export const visualMotionAuthorDeclaration: AuthorDeclarationCompiler = {
  module: visualTrackModuleRef, declaration: "motion", outputs: [visualTrackTypes.motion],
  shape: { summary: "Authors one reusable Clip-local affine and opacity Motion.", fields: [{ name: "id", kind: "identifier", required: true, summary: "Names this Motion value." }],
    children: [{ name: "Pose", cardinality: "many", summary: "Declares one complete visual state.", fields: poseFields }] },
  bindings(declaration) { const id = literal(declaration, "id"); return [{ name: id, ref: { kind: "record", id }, type: visualTrackTypes.motion }]; },
  compile({ declaration }) {
    const id = literal(declaration, "id"), motion = inlineMotion(declaration);
    if (motion === undefined) throw new Error(`${declaration.name} requires at least two Pose children.`);
    return { records: [{ id, type: visualTrackTypes.motion, value: motion as never, range: declaration.range }], components: [] };
  },
};

export const visualTrackAuthorDeclaration: AuthorDeclarationCompiler = {
  module: visualTrackModuleRef, declaration: "track",
  outputs: [spatialTypes.fit, visualTrackTypes.header, visualTrackTypes.motion,
    mediaTypes.pictureInterpretation,
    visualTrackTypes.paintLayerSpec, visualTrackTypes.sampleLayerSpec, visualTrackTypes.layerSet,
    visualTrackTypes.clipSpec, visualTrackTypes.transitionEffect, visualTrackTypes.transitionSpec,
    visualTrackTypes.set, visualTrackTypes.program, compositionTypes.visualTrack],
  shape: { summary: "Places ordinary visual Clips and explicit Transition relations on one completed Timeline.", fields: [
    { name: "id", kind: "identifier", required: true, summary: "Names this Track." },
    { name: "timeline", kind: "reference", required: true, accepts: [timelineTypes.timeline], summary: "Selects its absolute Timeline." },
  ], children: [{ name: "Clip", cardinality: "many", summary: "Places one independently timed visual source.", fields: [
    { name: "id", kind: "identifier", required: false, summary: "Optionally names this Clip." },
    { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Selects the destination Frame." },
    { name: "treatment", kind: "reference", required: false, accepts: [recipeType], summary: "Selects image and Frame treatment." },
    { name: "motion", kind: "reference", required: false, accepts: [visualTrackTypes.motion], summary: "Selects reusable Clip-local Motion." },
    { name: "clip", kind: "reference", required: false, accepts: [spatialTypes.path], summary: "Selects an authored clipping Path." },
    { name: "image", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects a durationless still image." },
    { name: "picture", kind: "literal", required: false, values: ["srgb"], summary: "Declares the still image's sample interpretation." },
    { name: "media", kind: "reference", required: false, accepts: [mediaTypes.prepared], summary: "Selects prepared timed media." },
    { name: "surface", kind: "reference", required: false, accepts: [mediaTypes.compositableSurface], summary: "Selects an alpha-aware Surface." },
    { name: "extent", kind: "reference", required: false, accepts: [spatialTypes.extent], summary: "Supplies a still image's intrinsic Extent." },
    { name: "mapping", kind: "reference", required: false, accepts: [spatialTypes.map2D], summary: "Selects an explicit source-to-picture spatial map." },
    { name: "fit", kind: "literal", required: false, values: ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"], summary: "Chooses automatic content fitting." },
    ...["frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y"].map((name) => ({ name, kind: "literal" as const, required: false, summary: `Supplies the fit ${name} parameter.` })),
    { name: "fit-constraint", kind: "literal", required: false, values: ["bounded", "free"], summary: "Chooses bounded or free fitting." },
    { name: "during", kind: "reference", required: true, accepts: [temporalTypes.window], summary: "Selects the resolved destination Window." },
  ], children: [
    { name: "Map", cardinality: "many", summary: "Adds one exact partial target-to-source temporal relation.", fields: relationFields },
    { name: "Curve", cardinality: "many", summary: "Adds one exact monotone cubic source-position relation.", fields: curveFields },
    { name: "Sampling", cardinality: "many", summary: "Animates the sampled crop inside the Frame.", fields: samplingFields },
    { name: "Pose", cardinality: "many", summary: "Animates the complete framed Clip.", fields: poseFields },
  ] }, { name: "Transition", cardinality: "many", summary: "Applies one visual effect to two adjacent Clips across their exact overlap.", fields: [
    { name: "id", kind: "identifier", required: true, summary: "Names this Transition relation." },
    { name: "outgoing", kind: "literal", required: true, summary: "Names the outgoing Clip id." },
    { name: "incoming", kind: "literal", required: true, summary: "Names the incoming Clip id." },
    { name: "effect", kind: "reference", required: true, accepts: [visualTrackTypes.transitionEffect], summary: "Selects the package-owned two-input visual effect." },
  ] }] },
  bindings(declaration) { const id = literal(declaration, "id"); return [outputBinding(id, "program", visualTrackTypes.program), outputBinding(id, "visual", compositionTypes.visualTrack)]; },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const clipChildren = declaration.children.filter((child) => child.name === "Clip");
    const transitionChildren = declaration.children.filter((child) => child.name === "Transition");
    if (clipChildren.length === 0) throw new Error(`${declaration.name} requires at least one Clip.`);
    const timeline = await resolved(declaration, "timeline", timelineTypes.timeline, resolveReference);
    const state = buildState(); state.addReference("timeline", timeline);
    state.addRecord("header", `${id}.header`, visualTrackTypes.header, sealVisualTrackHeader({ id }), declaration.range);
    const clips: FragmentClip[] = [];
    for (const [index, child] of clipChildren.entries()) {
      const suffix = String(index + 1).padStart(4, "0"), range = child.range ?? declaration.range;
      const clipId = field(child, "id") === undefined ? `${id}.clip.${suffix}` : literal(child, "id");
      const treatmentReference = field(child, "treatment") === undefined ? undefined : await resolved(child, "treatment", recipeType, resolveReference);
      const treatment: Recipe = treatmentReference === undefined ? { path: `${child.name}:default-treatment`, properties: {} } : recipe(treatmentReference, `${child.name}.treatment`);
      const sourceAppearance = sourceRecipe(child, treatment);
      const source = await declaredVisualSource(child, resolveReference);
      const pictureField = field(child, "picture");
      if (source.kind === "image" && pictureField === undefined) throw new Error(`${child.name}.picture is required with image.`);
      if (source.kind !== "image" && pictureField !== undefined) throw new Error(`${child.name}.picture is only valid with image.`);
      const frame = await resolved(child, "frame", spatialTypes.frame, resolveReference);
      const window = await resolved(child, "during", temporalTypes.window, resolveReference);
      const mapping = field(child, "mapping") === undefined ? undefined : await resolved(child, "mapping", spatialTypes.map2D, resolveReference);
      if (mapping !== undefined && FIT_FIELDS.some((name) => field(child, name) !== undefined)) throw new Error(`${child.name} cannot combine mapping with fit fields.`);
      const inline = inlineMotion(child);
      if (inline !== undefined && field(child, "motion") !== undefined) throw new Error(`${child.name} cannot combine motion with Pose children.`);
      const externalMotion = inline === undefined && field(child, "motion") !== undefined ? await resolved(child, "motion", visualTrackTypes.motion, resolveReference) : undefined;
      const clipPath = field(child, "clip") === undefined ? undefined : await resolved(child, "clip", spatialTypes.path, resolveReference);
      if (clipPath !== undefined && treatment.properties.clip !== undefined) throw new Error(`${child.name} cannot combine clip with treatment clip.`);
      const relation = samplingRelation(child), cropMotion = samplingMotion(child);
      const sourceKind = source.kind === "image" ? "still" : source.kind === "surface" ? "surface" : "timed";
      const layers: FragmentLayer[] = [];
      const framePaint = decodeMediaFramePaint(sourceAppearance, `${id}.clip-${suffix}.frame-paint`);
      if (framePaint !== undefined) { const name = `clip-${suffix}-frame-paint`; state.addRecord(name, `${id}.clip-${suffix}.frame-paint`, visualTrackTypes.paintLayerSpec, framePaint, range); layers.push({ kind: "paint", specName: name }); }
      const layerSuffix = `clip-${suffix}-layer-0001`, placementKind = mapping === undefined ? "fit" : "mapping", placementName = `${layerSuffix}-${placementKind}`;
      if (mapping === undefined) state.addRecord(placementName, `${id}.${layerSuffix}.fit`, spatialTypes.fit, decodeMediaFit(sourceAppearance), range); else state.addReference(placementName, mapping);
      const layerSpecName = `${layerSuffix}-spec`;
      state.addRecord(layerSpecName, `${id}.${layerSuffix}.spec`, visualTrackTypes.sampleLayerSpec, decodeMediaSampleSpec(sourceAppearance, "content", sourceKind, cropMotion, true, relation), range);
      const sourceName = `${layerSuffix}-source`; state.addReference(sourceName, source.value);
      if (source.kind === "image") {
        const extentName = `${layerSuffix}-extent`, pictureName = `${layerSuffix}-picture`;
        state.addReference(extentName, source.extent);
        state.addRecord(pictureName, `${id}.${layerSuffix}.picture`, mediaTypes.pictureInterpretation,
          pictureInterpretationProfile(literal(child, "picture") as "srgb"), range);
        layers.push({ kind: "still", sourceName, pictureName, extentName, placementKind, placementName, specName: layerSpecName });
      }
      else layers.push({ kind: source.kind === "media" ? "timed" : "surface", sourceName, placementKind, placementName, specName: layerSpecName });
      const specName = `clip-${suffix}-spec`;
      state.addRecord(specName, `${id}.clip.${suffix}.spec`, visualTrackTypes.clipSpec, decodeVisualClipSpec(treatment, { id: clipId }), range);
      const frameName = `clip-${suffix}-frame`, windowName = `clip-${suffix}-window`; state.addReference(frameName, frame); state.addReference(windowName, window);
      let clipPathName: string | undefined;
      if (clipPath !== undefined) {
        clipPathName = `clip-${suffix}-clip-path`;
        state.addReference(clipPathName, clipPath);
      }
      const motionName = inline === undefined && externalMotion === undefined ? undefined : `clip-${suffix}-motion`;
      if (motionName !== undefined) { if (inline !== undefined) state.addRecord(motionName, `${id}.clip.${suffix}.motion`, visualTrackTypes.motion, inline, range); else state.addReference(motionName, externalMotion!); }
      clips.push({ suffix, windowName, frameName, specName, layers, ...(clipPathName === undefined ? {} : { clipPathName }), ...(motionName === undefined ? {} : { motionName }) });
    }
    const transitions: FragmentTransition[] = [];
    for (const [index, child] of transitionChildren.entries()) {
      const suffix = String(index + 1).padStart(4, "0"), range = child.range ?? declaration.range;
      const transitionId = literal(child, "id");
      const effect = await resolved(child, "effect", visualTrackTypes.transitionEffect, resolveReference);
      const spec: VisualTransitionSpec = {
        id: transitionId,
        outgoingClipId: literal(child, "outgoing"),
        incomingClipId: literal(child, "incoming"),
        effect: authoredValue<VisualTransitionSpec["effect"]>(effect, `${child.name}.effect`),
      };
      const specName = `transition-${suffix}-spec`;
      state.addRecord(specName, `${id}.transition.${suffix}.spec`, visualTrackTypes.transitionSpec, spec, range);
      transitions.push({ suffix, specName });
    }
    return { records: state.records, components: [{ id, fragment: createVisualTrackFragment(state.inputTypes, clips, transitions), inputs: state.inputs, outputs: { visual: `${id}.visual`, program: `${id}.program` }, range: declaration.range }] };
  },
};

export const visualTrackAuthorDeclarations = [visualTrackAuthorDeclaration, visualMotionAuthorDeclaration] as const;

export const visualTrackMarkupDeclarations = [
  { name: "track", tag: "Track" },
  { name: "motion", tag: "Motion" },
] as const;

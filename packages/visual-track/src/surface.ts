import { parseInlineTemporalRelation, resolveTemporalContext } from "@hypit/temporal/markup";
import { assertEmptyElement as empty, assertAttributes as allowed, textAttribute as text, optionalTextAttribute as optionalText, type StructuredElement, type StructuredSurfaceHandler, type SurfaceRecordDraft, type SurfaceResolvedReference, type MarkupAttributeValue } from "@hypit/hypit/markup";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { blobTypes } from "@hypit/hypit/blob";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/hypit/author";
import type { FragmentOperation } from "@hypit/hypit/author";
import { mediaTypes } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import { temporalTypes } from "@hypit/temporal";
import { resolveTemporalWindowReference, temporalWindowAttributeNames } from "@hypit/temporal/markup";

import {
  decodeMediaFit,
  decodeMediaFramePaint,
  decodeVisualClipSpec,
  decodeMediaSampleSpec,
} from "./author.js";
import { sealVisualClipMotion } from "./motion.js";
import { sealVisualTrackHeader } from "./program.js";
import { visualTrackProducers, visualTrackTypes } from "./manifest.js";
import type {
  MediaSamplingMotion,
  VisualClipMotion,
  VisualMotionPosition,
} from "./types.js";
import type { TemporalRelationSpec } from "@hypit/temporal";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function numberValue(element: StructuredElement, name: string, fallback?: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be a finite number.`);
  return value;
}

function motionPosition(element: StructuredElement): VisualMotionPosition {
  const source = text(element, "at");
  if (source === "start") return { kind: "start", offsetFrames: 0 };
  if (source === "end") return { kind: "end", offsetFrames: 0 };
  const percentage = /^(\d+(?:\.\d+)?)%$/u.exec(source);
  if (percentage !== null) return { kind: "progress", value: Number(percentage[1]) / 100 };
  const fromStart = /^(?:start\+)?(\d+)f$/u.exec(source);
  if (fromStart !== null) return { kind: "start", offsetFrames: Number(fromStart[1]) };
  const fromEnd = /^end-(\d+)f$/u.exec(source);
  if (fromEnd !== null) return { kind: "end", offsetFrames: -Number(fromEnd[1]) };
  throw new Error(`${element.name}.at must be start, end, a percentage, an exact frame from start, or end-Nf.`);
}

export function decodeVisualPoseKeyframe(element: StructuredElement): VisualClipMotion["keyframes"][number] {
  allowed(element, ["at", "x", "y", "scale", "scale-x", "scale-y", "rotate", "opacity", "origin-x", "origin-y", "easing"]);
  empty(element);
  const scale = optionalText(element, "scale");
  if (scale !== undefined && (element.attributes["scale-x"] !== undefined || element.attributes["scale-y"] !== undefined)) {
    throw new Error(`${element.name}.scale cannot be combined with scale-x or scale-y.`);
  }
  const easing = optionalText(element, "easing");
  if (easing !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(easing)) {
    throw new Error(`${element.name}.easing is invalid.`);
  }
  const uniformScale = scale === undefined ? undefined : Number(scale);
  if (uniformScale !== undefined && !Number.isFinite(uniformScale)) throw new Error(`${element.name}.scale must be finite.`);
  return {
    at: motionPosition(element),
    translateX: numberValue(element, "x", 0),
    translateY: numberValue(element, "y", 0),
    scaleX: uniformScale ?? numberValue(element, "scale-x", 1),
    scaleY: uniformScale ?? numberValue(element, "scale-y", 1),
    rotationDeg: numberValue(element, "rotate", 0),
    opacity: numberValue(element, "opacity", 1),
    originX: numberValue(element, "origin-x", 0.5),
    originY: numberValue(element, "origin-y", 0.5),
    ...(easing === undefined ? {} : { easing: easing as "linear" | "ease-in" | "ease-out" | "ease-in-out" }),
  };
}

function inlineMotion(element: StructuredElement): VisualClipMotion | undefined {
  const keyframes = element.children.flatMap((child) => child.kind === "element"
    && (child.name.endsWith(":Pose") || child.name === "Pose") ? [decodeVisualPoseKeyframe(child)] : []);
  return keyframes.length === 0 ? undefined : sealVisualClipMotion({ keyframes });
}

export const decodeVisualMotionSurface: StructuredSurfaceHandler = ({ element }) => {
  allowed(element, ["id"]);
  const id = text(element, "id");
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Pose children.`);
      continue;
    }
    if (!child.name.endsWith(":Pose") && child.name !== "Pose") {
      throw new Error(`${element.name} accepts only Pose children.`);
    }
  }
  const motion = inlineMotion(element);
  if (motion === undefined) throw new Error(`${element.name} requires at least two Pose children.`);
  return {
    records: [{ id, type: visualTrackTypes.motion, value: (motion as never), range: element.range }],
    components: [], exports: [id],
  };
};

function reference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function recipe(value: SurfaceResolvedReference, label: string): Recipe {
  if (!sameType(value.type, recipeType) || value.record === undefined) {
    throw new Error(`${label} must be an authored SVS Recipe.`);
  }
  return value.record.value as unknown as Recipe;
}

const FIT_ATTRIBUTES = ["fit", "frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y", "fit-constraint"] as const;
const NUMERIC_CLIP_ATTRIBUTES = new Set(["frame-x", "frame-y", "content-x", "content-y", "fit-offset-x", "fit-offset-y"]);

function sourceRecipe(element: StructuredElement, treatment: Recipe): Recipe {
  const properties: Record<string, CanonicalValue> = { ...treatment.properties };
  for (const name of FIT_ATTRIBUTES) {
    const raw = optionalText(element, name);
    if (raw !== undefined) properties[name] = NUMERIC_CLIP_ATTRIBUTES.has(name) ? Number(raw) : raw;
  }
  return { path: `${treatment.path}:source`, properties };
}

function treatmentRecipe(
  element: StructuredElement,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): Recipe {
  if (element.attributes.treatment === undefined) return { path: `${element.name}:default-treatment`, properties: {} };
  return recipe(reference(element.attributes.treatment, `${element.name}.treatment`, recipeType, resolve), `${element.name}.treatment`);
}

type FragmentLayer =
  | { readonly kind: "paint"; readonly specName: string }
  | { readonly kind: "still"; readonly sourceName: string; readonly extentName: string; readonly placementKind: "fit" | "mapping"; readonly placementName: string; readonly specName: string }
  | { readonly kind: "timed" | "surface"; readonly sourceName: string; readonly placementKind: "fit" | "mapping"; readonly placementName: string; readonly specName: string };

type FragmentClip = {
  readonly suffix: string;
  readonly windowName: string;
  readonly frameName: string;
  readonly specName: string;
  readonly clipPathName?: string;
  readonly motionName?: string;
  readonly layers: readonly FragmentLayer[];
};

function appendLayers(operations: FragmentOperation[], prefix: string, layers: readonly FragmentLayer[]): string {
  const emptyId = `${prefix}:layers:empty`;
  operations.push({ id: emptyId, producer: visualTrackProducers.createLayers, inputs: {}, result: { kind: "output" as const, name: "layers" } });
  let current = emptyId;
  for (const [index, layer] of layers.entries()) {
    const id = `${prefix}:layers:${String(index + 1).padStart(4, "0")}`;
    const common = { layers: operation(current), spec: input(layer.specName) };
    if (layer.kind === "paint") {
      operations.push({ id, producer: visualTrackProducers.appendPaintLayer, inputs: common, result: { kind: "output" as const, name: "layers" } });
    } else if (layer.kind === "still") {
      operations.push({ id, producer: layer.placementKind === "fit"
        ? visualTrackProducers.appendStillLayer : visualTrackProducers.appendMappedStillLayer, inputs: {
        ...common, source: input(layer.sourceName), extent: input(layer.extentName),
        [layer.placementKind === "fit" ? "fit" : "mapping"]: input(layer.placementName),
      }, result: { kind: "output" as const, name: "layers" } });
    } else {
      const producer = layer.kind === "timed"
        ? layer.placementKind === "fit" ? visualTrackProducers.appendTimedLayer : visualTrackProducers.appendMappedTimedLayer
        : layer.placementKind === "fit" ? visualTrackProducers.appendSurfaceLayer : visualTrackProducers.appendMappedSurfaceLayer;
      const source = input(layer.sourceName);
      operations.push({ id, producer, inputs: {
        ...common,
        ...(layer.kind === "timed"
          ? { media: source }
          : { source }),
        [layer.placementKind === "fit" ? "fit" : "mapping"]: input(layer.placementName),
      }, result: { kind: "output" as const, name: "layers" } });
    }
    current = id;
  }
  return current;
}

function createVisualTrackSurfaceFragment(inputTypes: readonly { readonly name: string; readonly type: TypeRef }[], clips: readonly FragmentClip[]) {
  const operations: FragmentOperation[] = [
    { id: "track:set:empty", producer: visualTrackProducers.createSet, inputs: {}, result: { kind: "output" as const, name: "set" } },
  ];
  let set = "track:set:empty";
  for (const clip of clips) {
    const prefix = `clip:${clip.suffix}`;
    const layers = appendLayers(operations, prefix, clip.layers);
    const appendId = `${prefix}:append`;
    let spec: FragmentOperation["inputs"][string] = input(clip.specName);
    if (clip.clipPathName !== undefined) {
      const bindId = `${prefix}:bind-clip-path`;
      operations.push({ id: bindId, producer: visualTrackProducers.bindClipPath, inputs: {
        spec, path: input(clip.clipPathName),
      }, result: { kind: "output" as const, name: "spec" } });
      spec = operation(bindId);
    }
    if (clip.motionName !== undefined) {
      const bindId = `${prefix}:bind-motion`;
      operations.push({ id: bindId, producer: visualTrackProducers.bindMotion, inputs: {
        spec, motion: input(clip.motionName),
      }, result: { kind: "output" as const, name: "spec" } });
      spec = operation(bindId);
    }
    const common = {
      set: operation(set), header: input("header"), timeline: input("timeline"),
      layers: operation(layers), frame: input(clip.frameName), spec, window: input(clip.windowName),
    };
    operations.push({ id: appendId, producer: visualTrackProducers.appendClip,
      inputs: common, result: { kind: "output" as const, name: "set" } });
    set = appendId;
  }
  operations.push(
    { id: "track:finalize", producer: visualTrackProducers.finalize, inputs: { set: operation(set), header: input("header"), timeline: input("timeline") }, result: { kind: "output" as const, name: "program" } },
    { id: "track:visual", producer: visualTrackProducers.projectVisual, inputs: { timeline: input("timeline"), program: operation("track:finalize") }, result: { kind: "output" as const, name: "track" } },
  );
  return sealGraphFragment({
    inputs: inputTypes,
    operations,
    exports: [
      { name: "program", type: visualTrackTypes.program, root: operation("track:finalize") },
      { name: "visual", type: compositionTypes.visualTrack, root: operation("track:visual") },
    ],
  });
}

type SurfaceBuilder = {
  readonly records: SurfaceRecordDraft[];
  readonly inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }>;
  readonly inputTypes: { name: string; type: TypeRef }[];
  addReference(name: string, value: SurfaceResolvedReference): void;
  addRecord(name: string, id: string, type: TypeRef, value: unknown, range: StructuredElement["range"]): void;
  addValue(name: string, value: SurfaceResolvedReference["ref"], type: TypeRef): void;
};

function builder(): SurfaceBuilder {
  const records: SurfaceRecordDraft[] = [];
  const inputs: SurfaceBuilder["inputs"] = {};
  const inputTypes: SurfaceBuilder["inputTypes"] = [];
  return {
    records,
    inputs,
    inputTypes,
    addReference(name, value) {
      if (inputs[name] !== undefined) throw new Error(`Media Surface repeats input ${name}.`);
      inputs[name] = value.ref;
      inputTypes.push({ name, type: value.type });
    },
    addRecord(name, id, type, value, range) {
      if (inputs[name] !== undefined) throw new Error(`Media Surface repeats input ${name}.`);
      records.push({ id, type, value: (value as never), range });
      inputs[name] = { kind: "record", id };
      inputTypes.push({ name, type });
    },
    addValue(name, value, type) {
      if (inputs[name] !== undefined) throw new Error(`Media Surface repeats input ${name}.`);
      inputs[name] = value;
      inputTypes.push({ name, type });
    },
  };
}

function suffix(index: number): string {
  return String(index).padStart(4, "0");
}

type SourceLayerContext = {
  readonly trackId: string;
  readonly unitSuffix: string;
  readonly defaultRecipe: Recipe;
  readonly sourceElement: StructuredElement;
  readonly source?: DeclaredVisualSource;
  readonly sampling?: TemporalRelationSpec;
  readonly ignoreSiblingChildren?: boolean;
  readonly defaultLayerId?: string;
  readonly mapping?: SurfaceResolvedReference;
};

type DeclaredVisualSource =
  | { readonly kind: "image"; readonly value: SurfaceResolvedReference; readonly extent: SurfaceResolvedReference }
  | { readonly kind: "media"; readonly value: SurfaceResolvedReference }
  | { readonly kind: "surface"; readonly value: SurfaceResolvedReference };

const VISUAL_SOURCE_ATTRIBUTES = ["image", "media", "surface"] as const;

function declaredVisualSource(
  element: StructuredElement,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
  required = false,
): DeclaredVisualSource | undefined {
  const present = VISUAL_SOURCE_ATTRIBUTES.filter((name) => element.attributes[name] !== undefined);
  if (present.length === 0) {
    if (element.attributes.extent !== undefined) throw new Error(`${element.name}.extent requires image={Artifact}.`);
    if (element.attributes.audio !== undefined) throw new Error(`${element.name}.audio is no longer accepted; prepare the source explicitly and use media={...}.`);
    if (required) throw new Error(`${element.name} requires exactly one of image, media or surface.`);
    return undefined;
  }
  if (present.length !== 1) throw new Error(`${element.name} requires exactly one of image, media or surface.`);
  const kind = present[0]!;
  if (kind === "image") {
    if (element.attributes.audio !== undefined) throw new Error(`${element.name}.audio is no longer accepted; prepare the source explicitly and use media={...}.`);
    return {
      kind,
      value: reference(element.attributes.image, `${element.name}.image`, blobTypes.blob, resolve),
      extent: reference(element.attributes.extent, `${element.name}.extent`, spatialTypes.extent, resolve),
    };
  }
  if (element.attributes.extent !== undefined) throw new Error(`${element.name}.extent is only valid with image={Artifact}.`);
  if (element.attributes.audio !== undefined) throw new Error(`${element.name}.audio is no longer accepted; prepare the source explicitly and use media={...}.`);
  return kind === "media"
    ? { kind, value: reference(element.attributes.media, `${element.name}.media`, mediaTypes.prepared, resolve) }
    : { kind, value: reference(element.attributes.surface, `${element.name}.surface`, mediaTypes.compositableSurface, resolve) };
}

export function decodeMediaSamplingKeyframe(element: StructuredElement): MediaSamplingMotion["keyframes"][number] {
  allowed(element, ["at", "zoom", "x", "y", "rotate", "easing"]);
  empty(element);
  const at = text(element, "at");
  const percentage = /^(\d+(?:\.\d+)?)%$/u.exec(at);
  const atProgress = at === "start" ? 0 : at === "end" ? 1
    : percentage === null ? Number.NaN : Number(percentage[1]) / 100;
  if (!Number.isFinite(atProgress) || atProgress < 0 || atProgress > 1) {
    throw new Error(`${element.name}.at must be start, end or a percentage inside 0%..100%.`);
  }
  const easing = optionalText(element, "easing");
  if (easing !== undefined && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(easing)) {
    throw new Error(`${element.name}.easing is invalid.`);
  }
  return {
    atProgress, zoom: numberValue(element, "zoom", 1), offsetX: numberValue(element, "x", 0),
    offsetY: numberValue(element, "y", 0), rotationDeg: numberValue(element, "rotate", 0),
    ...(easing === undefined ? {} : { easing: easing as "linear" | "ease-in" | "ease-out" | "ease-in-out" }),
  };
}

function decodeSamplingMotion(element: StructuredElement, ignoreSiblingChildren = false): MediaSamplingMotion | undefined {
  const keyframes = element.children.flatMap((child) => {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Sampling children.`);
      return [];
    }
    if (!child.name.endsWith(":Sampling") && child.name !== "Sampling") {
      if (ignoreSiblingChildren) return [];
      throw new Error(`${element.name} accepts only Sampling children.`);
    }
    return [decodeMediaSamplingKeyframe(child)];
  });
  return keyframes.length === 0 ? undefined : { keyframes };
}

function sourceLayer(
  state: SurfaceBuilder,
  context: SourceLayerContext,
  layerIndex: number,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): FragmentLayer {
  const element = context.sourceElement;
  const source = context.source ?? declaredVisualSource(element, resolve, true)!;
  const appearance = element.attributes.appearance === undefined
    ? context.defaultRecipe
    : recipe(reference(element.attributes.appearance, `${element.name}.appearance`, recipeType, resolve), `${element.name}.appearance`);
  const motion = decodeSamplingMotion(element, context.ignoreSiblingChildren);
  const layerSuffix = `${context.unitSuffix}-layer-${suffix(layerIndex)}`;
  const layerId = context.defaultLayerId ?? optionalText(element, "id") ?? `${context.trackId}.${layerSuffix}`;
  const placementKind = context.mapping === undefined ? "fit" : "mapping";
  const placementName = `${layerSuffix}-${placementKind}`;
  const specName = `${layerSuffix}-spec`;
  if (context.mapping === undefined) {
    state.addRecord(placementName, `${context.trackId}.${layerSuffix}.fit`, spatialTypes.fit, decodeMediaFit(appearance), element.range);
  } else {
    state.addReference(placementName, context.mapping);
  }
  const sourceKind = source.kind === "image" ? "still"
    : source.kind === "surface" ? "surface" : "timed";
  const spec = decodeMediaSampleSpec(
    appearance,
    layerId,
    sourceKind,
    motion,
    context.source !== undefined,
    context.sampling,
  );
  state.addRecord(specName, `${context.trackId}.${layerSuffix}.spec`, visualTrackTypes.sampleLayerSpec, spec, element.range);
  const sourceName = `${layerSuffix}-source`;
  state.addReference(sourceName, source.value);
  if (sourceKind === "still") {
    const extentName = `${layerSuffix}-extent`;
    state.addReference(extentName, (source as Extract<DeclaredVisualSource, { readonly kind: "image" }>).extent);
    return { kind: "still", sourceName, extentName, placementKind, placementName, specName };
  }
  return { kind: sourceKind, sourceName, placementKind, placementName, specName };
}

function unitLayers(
  state: SurfaceBuilder,
  input: {
    readonly trackId: string;
    readonly unitSuffix: string;
    readonly element: StructuredElement;
    readonly appearance: Recipe;
    readonly directSource: DeclaredVisualSource;
    readonly sampling?: TemporalRelationSpec;
    readonly mapping?: SurfaceResolvedReference;
    readonly allowFramePaint: boolean;
  },
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): readonly FragmentLayer[] {
  const layers: FragmentLayer[] = [];
  if (input.allowFramePaint) {
    const framePaint = decodeMediaFramePaint(input.appearance, `${input.trackId}.${input.unitSuffix}.frame-paint`);
    if (framePaint !== undefined) {
      const name = `${input.unitSuffix}-frame-paint`;
      state.addRecord(name, `${input.trackId}.${input.unitSuffix}.frame-paint`, visualTrackTypes.paintLayerSpec, framePaint, input.element.range);
      layers.push({ kind: "paint", specName: name });
    }
  }
  layers.push(sourceLayer(state, {
    trackId: input.trackId, unitSuffix: input.unitSuffix, defaultRecipe: input.appearance,
    sourceElement: input.element, source: input.directSource,
    ...(input.mapping === undefined ? {} : { mapping: input.mapping }),
    ...(input.sampling === undefined ? {} : { sampling: input.sampling }),
    ignoreSiblingChildren: true,
    defaultLayerId: "content",
  }, 1, resolve));
  return layers;
}

function validateUnitChildren(element: StructuredElement): void {
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} cannot contain text.`);
      continue;
    }
    const samplingChild = child.name.endsWith(":Sampling") || child.name === "Sampling";
    const poseChild = child.name.endsWith(":Pose") || child.name === "Pose";
    const mapChild = child.name.endsWith(":Map") || child.name === "Map";
    if (samplingChild || poseChild || mapChild) continue;
    throw new Error(`${element.name} has unsupported child ${child.name}.`);
  }
}

export const decodeVisualTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "timeline"]);
  const trackId = text(element, "id");
  const state = builder();
  const context = resolveTemporalContext({ element, resolveReference });
  state.addReference("timeline", context.timeline);
  const headerId = `${trackId}.header`;
  state.addRecord("header", headerId, visualTrackTypes.header,
    sealVisualTrackHeader({ id: trackId }), element.range);
  const clips: FragmentClip[] = [];
  let clipIndex = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Clip children.`);
      continue;
    }
    if (child.name.endsWith(":Clip") || child.name === "Clip") {
      clipIndex += 1;
      const clipSuffix = suffix(clipIndex);
      allowed(child, [
        "id", "frame", "treatment", "motion",
        "image", "media", "surface", "extent",
        "clip", "mapping", ...FIT_ATTRIBUTES, ...temporalWindowAttributeNames,
      ]);
      const id = optionalText(child, "id") ?? `${trackId}.clip.${clipSuffix}`;
      const treatment = treatmentRecipe(child, resolveReference);
      const sourceAppearance = sourceRecipe(child, treatment);
      const clipPathName = child.attributes.clip === undefined ? undefined : `clip-${clipSuffix}-clip-path`;
      if (clipPathName !== undefined) {
        if (treatment.properties.clip !== undefined) throw new Error(`${child.name} cannot combine clip={Path} with treatment clip.`);
        state.addReference(clipPathName, reference(child.attributes.clip, `${child.name}.clip`, spatialTypes.path, resolveReference));
      }
      const authoredMotion = inlineMotion(child);
      if (authoredMotion !== undefined && child.attributes.motion !== undefined) {
        throw new Error(`${child.name} cannot combine motion={Motion} with Pose children.`);
      }
      const motionName = authoredMotion === undefined && child.attributes.motion === undefined ? undefined : `clip-${clipSuffix}-motion`;
      if (motionName !== undefined) {
        if (authoredMotion !== undefined) {
          state.addRecord(motionName, `${trackId}.clip.${clipSuffix}.motion`, visualTrackTypes.motion, authoredMotion, child.range);
        } else {
          state.addReference(motionName, reference(child.attributes.motion, `${child.name}.motion`, visualTrackTypes.motion, resolveReference));
        }
      }
      const window = resolveTemporalWindowReference({ element: child, resolveReference });
      const directSource = declaredVisualSource(child, resolveReference, true)!;
      const sampling = parseInlineTemporalRelation(child);
      const mapping = child.attributes.mapping === undefined ? undefined
        : reference(child.attributes.mapping, `${child.name}.mapping`, spatialTypes.map2D, resolveReference);
      if (mapping !== undefined && FIT_ATTRIBUTES.some((name) => child.attributes[name] !== undefined)) {
        throw new Error(`${child.name} cannot combine mapping={SpatialMap2D} with fit attributes.`);
      }
      validateUnitChildren(child);
      const layers = unitLayers(state, { trackId, unitSuffix: `clip-${clipSuffix}`, element: child, appearance: sourceAppearance,
        directSource, ...(sampling === undefined ? {} : { sampling }), ...(mapping === undefined ? {} : { mapping }),
        allowFramePaint: true }, resolveReference);
      const specName = `clip-${clipSuffix}-spec`;
      const windowName = `clip-${clipSuffix}-window`;
      state.addValue(windowName, window.ref, temporalTypes.window);
      state.addRecord(specName, `${trackId}.clip.${clipSuffix}.spec`, visualTrackTypes.clipSpec,
        decodeVisualClipSpec(treatment, { id }), child.range);
      const frameName = `clip-${clipSuffix}-frame`;
      state.addReference(frameName, reference(child.attributes.frame, `${child.name}.frame`, spatialTypes.frame, resolveReference));
      clips.push({ suffix: clipSuffix, windowName, frameName, specName,
        ...(clipPathName === undefined ? {} : { clipPathName }),
        ...(motionName === undefined ? {} : { motionName }), layers });
      continue;
    }
    throw new Error(`${element.name} accepts only Clip children.`);
  }
  if (clips.length === 0) {
    throw new Error(`${element.name} requires at least one Clip.`);
  }
  const fragment = createVisualTrackSurfaceFragment(state.inputTypes, clips);
  return {
    records: state.records,
    components: [{
      id: trackId,
      fragment,
      inputs: state.inputs,
      outputs: { visual: `${trackId}.visual`, program: `${trackId}.program` },
      range: element.range,
    }],
    exports: [
      `${trackId}.program`,
      `${trackId}.visual`,
    ],
  };
};

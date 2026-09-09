import { createTemporalSpace, resolveTemporalContext } from "@hypit/temporal-markup";
import {
  assertEmptyElement as empty,
  assertAttributes as allowed,
  textAttribute as text,
  optionalTextAttribute as optionalText,
  type StructuredElement,
  type StructuredSurfaceHandler,
  type SurfaceComponentDraft,
  type SurfaceRecordDraft,
  type SurfaceResolvedReference,
  type MarkupAttributeValue,
} from "@hypit/markup";
import { sameType, type TypeRef } from "@hypit/protocol";
import { artifactTypes } from "@hypit/artifact";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import { temporalTypes } from "@hypit/temporal";
import { createTemporalInstantProjection, createTemporalWindowProjection, temporalInstantAttributeNames, temporalWindowAttributeNames } from "@hypit/temporal-markup";

import {
  decodeMediaFit,
  decodeMediaFramePaint,
  decodeMediaHandoffSpec,
  decodeMediaItemSpec,
  decodeMediaMotion,
  decodeMediaPaintSpec,
  decodeMediaSampleSpec,
  decodeMediaSequenceSpec,
} from "./author.js";
import {
  sealMediaSequenceMemberSpec,
} from "./sequence.js";
import { sealMediaSoundSpec } from "./sounds.js";
import { sealMediaTrackHeader } from "./program.js";
import { mediaTrackProducers, mediaTrackTypes } from "./manifest.js";
import type {
  MediaHandoffSpec,
  MediaSampleLayerSpec,
  MediaSamplingMotion,
  MediaSequenceMemberSpec,
  MediaSoundSpec,
} from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function numberValue(element: StructuredElement, name: string, fallback?: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be a finite number.`);
  return value;
}

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

function recipe(value: SurfaceResolvedReference, label: string): SvsRecipe {
  if (!sameType(value.type, svsRecipeType) || value.record?.value.kind !== "inline") {
    throw new Error(`${label} must be an authored SVS Recipe.`);
  }
  return value.record.value.value as unknown as SvsRecipe;
}

type FragmentLayer =
  | { readonly kind: "paint"; readonly specName: string }
  | { readonly kind: "still"; readonly sourceName: string; readonly extentName: string; readonly fitName: string; readonly specName: string }
  | { readonly kind: "timed" | "surface"; readonly sourceName: string; readonly fitName: string; readonly specName: string };

type FragmentSound = { readonly sourceName: string; readonly specName: string };

type FragmentItem = {
  readonly performance?: { readonly fitName: string; readonly sampleName: string };
  readonly suffix: string;
  readonly windowName: string;
  readonly frameName: string;
  readonly specName: string;
  readonly clipPathName?: string;
  readonly layers: readonly FragmentLayer[];
  readonly sounds: readonly FragmentSound[];
};

type FragmentMember = {
  readonly suffix: string;
  readonly instantName: string;
  readonly specName: string;
  readonly layers: readonly FragmentLayer[];
};

type FragmentSequence = {
  readonly suffix: string;
  readonly terminalName: string;
  readonly frameName: string;
  readonly specName: string;
  readonly clipPathName?: string;
  readonly members: readonly FragmentMember[];
  readonly sounds: readonly FragmentSound[];
};

function appendLayers(operations: FragmentOperation[], prefix: string, layers: readonly FragmentLayer[]): string {
  const emptyId = `${prefix}:layers:empty`;
  operations.push({ id: emptyId, producer: mediaTrackProducers.createLayers, inputs: {}, result: { kind: "output", name: "layers" } });
  let current = emptyId;
  for (const [index, layer] of layers.entries()) {
    const id = `${prefix}:layers:${String(index + 1).padStart(4, "0")}`;
    const common = { layers: operation(current), spec: input(layer.specName) };
    if (layer.kind === "paint") {
      operations.push({ id, producer: mediaTrackProducers.appendPaintLayer, inputs: common, result: { kind: "output", name: "layers" } });
    } else if (layer.kind === "still") {
      operations.push({ id, producer: mediaTrackProducers.appendStillLayer, inputs: {
        ...common, source: input(layer.sourceName), extent: input(layer.extentName), fit: input(layer.fitName),
      }, result: { kind: "output", name: "layers" } });
    } else {
      operations.push({ id, producer: layer.kind === "timed" ? mediaTrackProducers.appendTimedLayer : mediaTrackProducers.appendSurfaceLayer,
        inputs: { ...common, source: input(layer.sourceName), fit: input(layer.fitName) }, result: { kind: "output", name: "layers" } });
    }
    current = id;
  }
  return current;
}

function appendSounds(operations: FragmentOperation[], prefix: string, sounds: readonly FragmentSound[]): string {
  const emptyId = `${prefix}:sounds:empty`;
  operations.push({ id: emptyId, producer: mediaTrackProducers.createSounds, inputs: {}, result: { kind: "output", name: "sounds" } });
  let current = emptyId;
  for (const [index, sound] of sounds.entries()) {
    const id = `${prefix}:sounds:${String(index + 1).padStart(4, "0")}`;
    operations.push({ id, producer: mediaTrackProducers.appendSound, inputs: {
      sounds: operation(current), source: input(sound.sourceName), spec: input(sound.specName),
    }, result: { kind: "output", name: "sounds" } });
    current = id;
  }
  return current;
}

function createMediaTrackSurfaceFragment(inputTypes: readonly { readonly name: string; readonly type: TypeRef }[], items: readonly FragmentItem[], sequences: readonly FragmentSequence[], audio: boolean) {
  const operations: FragmentOperation[] = [
    { id: "track:set:empty", producer: mediaTrackProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } },
  ];
  let set = "track:set:empty";
  for (const item of items) {
    const prefix = `item:${item.suffix}`;
    const layers = appendLayers(operations, prefix, item.layers);
    const sounds = appendSounds(operations, prefix, item.sounds);
    const appendId = `${prefix}:append`;
    let spec: FragmentOperation["inputs"][string] = input(item.specName);
    if (item.clipPathName !== undefined) {
      const bindId = `${prefix}:bind-clip-path`;
      operations.push({ id: bindId, producer: mediaTrackProducers.bindItemClipPath, inputs: {
        spec, path: input(item.clipPathName),
      }, result: { kind: "output", name: "spec" } });
      spec = operation(bindId);
    }
    const common = {
      set: operation(set), header: input("header"), space: input("space"), canvas: input("canvas"),
      layers: operation(layers), frame: input(item.frameName), spec, sounds: operation(sounds), window: input(item.windowName),
    };
    operations.push({ id: appendId, producer: item.performance === undefined ? mediaTrackProducers.appendItem : mediaTrackProducers.appendPerformance,
      inputs: { ...common, ...(item.performance === undefined ? {} : { semantic: input("semantic"), fit: input(item.performance.fitName), sampleSpec: input(item.performance.sampleName) }) }, result: { kind: "output", name: "set" } });
    set = appendId;
  }
  for (const sequence of sequences) {
    const prefix = `sequence:${sequence.suffix}`;
    const emptyMembers = `${prefix}:members:empty`;
    operations.push({ id: emptyMembers, producer: mediaTrackProducers.createMembers, inputs: {}, result: { kind: "output", name: "members" } });
    let members = emptyMembers;
    for (const member of sequence.members) {
      const memberPrefix = `${prefix}:member:${member.suffix}`;
      const layers = appendLayers(operations, memberPrefix, member.layers);
      const appendId = `${memberPrefix}:append`;
      operations.push({ id: appendId, producer: mediaTrackProducers.appendMember, inputs: {
        members: operation(members), space: input("space"), layers: operation(layers), spec: input(member.specName), activation: input(member.instantName),
      }, result: { kind: "output", name: "members" } });
      members = appendId;
    }
    const sounds = appendSounds(operations, prefix, sequence.sounds);
    const appendId = `${prefix}:append`;
    let spec: FragmentOperation["inputs"][string] = input(sequence.specName);
    if (sequence.clipPathName !== undefined) {
      const bindId = `${prefix}:bind-clip-path`;
      operations.push({ id: bindId, producer: mediaTrackProducers.bindSequenceClipPath, inputs: {
        spec, path: input(sequence.clipPathName),
      }, result: { kind: "output", name: "spec" } });
      spec = operation(bindId);
    }
    const common = {
      set: operation(set), header: input("header"), space: input("space"), canvas: input("canvas"),
      members: operation(members), frame: input(sequence.frameName), spec, sounds: operation(sounds),
    };
    operations.push({ id: appendId, producer: mediaTrackProducers.appendSequence,
      inputs: { ...common, terminal: input(sequence.terminalName) }, result: { kind: "output", name: "set" } });
    set = appendId;
  }
  operations.push(
    { id: "track:finalize", producer: mediaTrackProducers.finalize, inputs: { set: operation(set), header: input("header"), space: input("space") }, result: { kind: "output", name: "program" } },
    { id: "track:visual", producer: mediaTrackProducers.projectVisual, inputs: { space: input("space"), program: operation("track:finalize") }, result: { kind: "output", name: "track" } },
  );
  if (audio) operations.push({ id: "track:audio", producer: mediaTrackProducers.projectAudio, inputs: { space: input("space"), program: operation("track:finalize") }, result: { kind: "output", name: "track" } });
  return sealGraphFragment({
    inputs: inputTypes,
    operations,
    exports: [
      { name: "program", type: mediaTrackTypes.program, root: operation("track:finalize") },
      { name: "visual", type: compositionTypes.visualTrack, root: operation("track:visual") },
      ...(audio ? [{ name: "audio" as const, type: compositionTypes.audioTrack, root: operation("track:audio") }] : []),
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
      records.push({ id, type, value: { kind: "inline", value: value as never }, range });
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
  readonly defaultRecipe: SvsRecipe;
  readonly sourceElement: StructuredElement;
  readonly source?: DeclaredVisualSource;
  readonly ignoreSiblingChildren?: boolean;
  readonly defaultLayerId?: string;
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
    if (element.attributes.audio !== undefined) throw new Error(`${element.name}.audio is no longer accepted; normalize the source explicitly and use media={...}.`);
    if (required) throw new Error(`${element.name} requires exactly one of image, media or surface.`);
    return undefined;
  }
  if (present.length !== 1) throw new Error(`${element.name} requires exactly one of image, media or surface.`);
  const kind = present[0]!;
  if (kind === "image") {
    if (element.attributes.audio !== undefined) throw new Error(`${element.name}.audio is no longer accepted; normalize the source explicitly and use media={...}.`);
    return {
      kind,
      value: reference(element.attributes.image, `${element.name}.image`, artifactTypes.blob, resolve),
      extent: reference(element.attributes.extent, `${element.name}.extent`, spatialTypes.extent, resolve),
    };
  }
  if (element.attributes.extent !== undefined) throw new Error(`${element.name}.extent is only valid with image={Artifact}.`);
  if (element.attributes.audio !== undefined) throw new Error(`${element.name}.audio is no longer accepted; normalize the source explicitly and use media={...}.`);
  return kind === "media"
    ? { kind, value: reference(element.attributes.media, `${element.name}.media`, mediaTypes.synchronized, resolve) }
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
    : recipe(reference(element.attributes.appearance, `${element.name}.appearance`, svsRecipeType, resolve), `${element.name}.appearance`);
  const motion = decodeSamplingMotion(element, context.ignoreSiblingChildren);
  const layerSuffix = `${context.unitSuffix}-layer-${suffix(layerIndex)}`;
  const layerId = context.defaultLayerId ?? optionalText(element, "id") ?? `${context.trackId}.${layerSuffix}`;
  const fitName = `${layerSuffix}-fit`;
  const specName = `${layerSuffix}-spec`;
  state.addRecord(fitName, `${context.trackId}.${layerSuffix}.fit`, spatialTypes.fit, decodeMediaFit(appearance), element.range);
  const sourceKind = source.kind === "image" ? "still"
    : source.kind === "surface" ? "surface" : "timed";
  const spec = decodeMediaSampleSpec(appearance, layerId, sourceKind, motion, context.source !== undefined);
  state.addRecord(specName, `${context.trackId}.${layerSuffix}.spec`, mediaTrackTypes.sampleLayerSpec, spec, element.range);
  const sourceName = `${layerSuffix}-source`;
  state.addReference(sourceName, source.value);
  if (sourceKind === "still") {
    const extentName = `${layerSuffix}-extent`;
    state.addReference(extentName, (source as Extract<DeclaredVisualSource, { readonly kind: "image" }>).extent);
    return { kind: "still", sourceName, extentName, fitName, specName };
  }
  return { kind: sourceKind, sourceName, fitName, specName };
}

function unitLayers(
  state: SurfaceBuilder,
  input: {
    readonly trackId: string;
    readonly unitSuffix: string;
    readonly element: StructuredElement;
    readonly appearance: SvsRecipe;
    readonly directSource?: DeclaredVisualSource;
    readonly allowFramePaint: boolean;
    readonly allowEmpty?: boolean;
  },
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): readonly FragmentLayer[] {
  const layers: FragmentLayer[] = [];
  if (input.allowFramePaint) {
    const framePaint = decodeMediaFramePaint(input.appearance, `${input.trackId}.${input.unitSuffix}.frame-paint`);
    if (framePaint !== undefined) {
      const name = `${input.unitSuffix}-frame-paint`;
      state.addRecord(name, `${input.trackId}.${input.unitSuffix}.frame-paint`, mediaTrackTypes.paintLayerSpec, framePaint, input.element.range);
      layers.push({ kind: "paint", specName: name });
    }
  }
  const explicit = input.element.children.filter((child): child is StructuredElement => child.kind === "element"
    && (child.name.endsWith(":Paint") || child.name === "Paint" || child.name.endsWith(":Layer") || child.name === "Layer"));
  if (input.directSource !== undefined && explicit.length > 0) {
    throw new Error(`${input.element.name} cannot combine a direct source with Paint or Layer children.`);
  }
  if (input.directSource !== undefined) {
    layers.push(sourceLayer(state, {
      trackId: input.trackId, unitSuffix: input.unitSuffix, defaultRecipe: input.appearance,
      sourceElement: input.element, source: input.directSource,
      ignoreSiblingChildren: true,
      defaultLayerId: "content",
    }, 1, resolve));
    return layers;
  }
  let layerIndex = 0;
  for (const child of explicit) {
    layerIndex += 1;
    if (child.name.endsWith(":Paint") || child.name === "Paint") {
      allowed(child, ["id", "appearance"]);
      empty(child);
      const appearance = recipe(reference(child.attributes.appearance, `${child.name}.appearance`, svsRecipeType, resolve), `${child.name}.appearance`);
      const id = optionalText(child, "id") ?? `${input.trackId}.${input.unitSuffix}.paint.${suffix(layerIndex)}`;
      const name = `${input.unitSuffix}-paint-${suffix(layerIndex)}`;
      state.addRecord(name, `${input.trackId}.${input.unitSuffix}.paint.${suffix(layerIndex)}`, mediaTrackTypes.paintLayerSpec,
        decodeMediaPaintSpec(appearance, id), child.range);
      layers.push({ kind: "paint", specName: name });
      continue;
    }
    allowed(child, ["id", "image", "media", "surface", "extent", "appearance"]);
    layers.push(sourceLayer(state, {
      trackId: input.trackId, unitSuffix: input.unitSuffix, defaultRecipe: input.appearance, sourceElement: child,
    }, layerIndex, resolve));
  }
  if (layers.length === 0 && !input.allowEmpty) throw new Error(`${input.element.name} requires a direct source or at least one Paint/Layer child.`);
  return layers;
}

function validateUnitChildren(element: StructuredElement, direct: boolean, allowSound: boolean): void {
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} cannot contain text.`);
      continue;
    }
    const samplingChild = child.name.endsWith(":Sampling") || child.name === "Sampling";
    const layerChild = child.name.endsWith(":Layer") || child.name === "Layer";
    const paintChild = child.name.endsWith(":Paint") || child.name === "Paint";
    const soundChild = child.name.endsWith(":Sound") || child.name === "Sound";
    if ((direct && samplingChild) || (!direct && (layerChild || paintChild)) || (allowSound && soundChild)) continue;
    throw new Error(`${element.name} has unsupported child ${child.name}.`);
  }
}

function sourceAudio(
  element: StructuredElement,
): MediaSequenceMemberSpec["sourceAudio"] {
  const fromLayer = optionalText(element, "source-audio");
  if (fromLayer === undefined) {
    if (element.attributes["audio-gain"] !== undefined) throw new Error(`${element.name}.audio-gain requires source-audio.`);
    return undefined;
  }
  return { fromLayer, gain: numberValue(element, "audio-gain", 1) };
}

function sound(
  state: SurfaceBuilder,
  element: StructuredElement,
  unitSuffix: string,
  trackId: string,
  index: number,
  handoffIds: ReadonlySet<string>,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): FragmentSound {
  allowed(element, ["id", "source", "at", "handoff", "gain"]);
  empty(element);
  const at = optionalText(element, "at");
  const handoff = optionalText(element, "handoff");
  if (Number(at !== undefined) + Number(handoff !== undefined) !== 1) {
    throw new Error(`${element.name} requires exactly one of at or handoff.`);
  }
  let trigger: MediaSoundSpec["trigger"];
  if (handoff !== undefined) {
    if (!handoffIds.has(handoff)) throw new Error(`${element.name}.handoff does not name a Handoff in this Sequence.`);
    trigger = { kind: "handoff", handoffId: handoff };
  } else {
    if (at !== "enter" && at !== "exit") throw new Error(`${element.name}.at must be enter or exit.`);
    trigger = { kind: at };
  }
  const soundSuffix = `${unitSuffix}-sound-${suffix(index)}`;
  const specName = `${soundSuffix}-spec`;
  const sourceName = `${soundSuffix}-source`;
  const id = optionalText(element, "id") ?? `${trackId}.${soundSuffix}`;
  state.addRecord(specName, `${trackId}.${soundSuffix}.spec`, mediaTrackTypes.soundSpec,
    sealMediaSoundSpec({ id, trigger, gain: numberValue(element, "gain", 1) }), element.range);
  state.addReference(sourceName, reference(element.attributes.source, `${element.name}.source`, mediaTypes.synchronized, resolve));
  return { sourceName, specName };
}

export const decodeMediaTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "semantic", "space", "canvas"]);
  const trackId = text(element, "id");
  const state = builder();
  const context = resolveTemporalContext({ element, resolveReference });
  const time = createTemporalSpace({ id: trackId, element, ...context });
  state.addReference("space", time.space);
  state.addReference("canvas", reference(element.attributes.canvas, `${element.name}.canvas`, spatialTypes.canvas, resolveReference));
  const headerId = `${trackId}.header`;
  state.addRecord("header", headerId, mediaTrackTypes.header,
    sealMediaTrackHeader({ id: trackId }), element.range);
  const items: FragmentItem[] = [];
  const sequences: FragmentSequence[] = [];
  const temporalComponents: SurfaceComponentDraft[] = [...time.components];
  const temporalFragments: ReturnType<typeof createTemporalWindowProjection>["fragments"][number][] = [...time.fragments];
  let itemIndex = 0;
  let sequenceIndex = 0;
  let hasAudio = false;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Performance, Item and Sequence children.`);
      continue;
    }
    const isPerformance = child.name.endsWith(":Performance") || child.name === "Performance";
    if (isPerformance) {
      if (context.semantic === undefined) throw new Error(`${child.name} requires semantic performance input.`);
      if (state.inputs.semantic === undefined) state.addReference("semantic", context.semantic);
    }
    if (isPerformance || child.name.endsWith(":Item") || child.name === "Item") {
      itemIndex += 1;
      const itemSuffix = suffix(itemIndex);
      allowed(child, [
        "id", "frame", "appearance", "motion",
        ...(isPerformance ? [] : ["image", "media", "surface", "extent", "source-audio", "audio-gain"]),
        "clip", ...temporalWindowAttributeNames,
      ]);
      const id = optionalText(child, "id") ?? `${trackId}.item.${itemSuffix}`;
      const appearance = recipe(reference(child.attributes.appearance, `${child.name}.appearance`, svsRecipeType, resolveReference), `${child.name}.appearance`);
      const clipPathName = child.attributes.clip === undefined ? undefined : `item-${itemSuffix}-clip-path`;
      if (clipPathName !== undefined) {
        if (appearance.properties.clip !== undefined) throw new Error(`${child.name} cannot combine clip={Path} with Recipe clip.`);
        state.addReference(clipPathName, reference(child.attributes.clip, `${child.name}.clip`, spatialTypes.path, resolveReference));
      }
      const motionRecipe = child.attributes.motion === undefined ? undefined
        : recipe(reference(child.attributes.motion, `${child.name}.motion`, svsRecipeType, resolveReference), `${child.name}.motion`);
      const temporal = createTemporalWindowProjection({ id, element: child, ...context, space: time.space, resolveReference });
      state.records.push(...temporal.records); temporalComponents.push(...temporal.components); temporalFragments.push(...temporal.fragments);
      const performance = isPerformance ? {
        fitName: `item-${itemSuffix}-fit`, sampleName: `item-${itemSuffix}-sample`,
      } : undefined;
      const directSource = isPerformance ? undefined : declaredVisualSource(child, resolveReference);
      validateUnitChildren(child, isPerformance || directSource !== undefined, true);
      if (performance !== undefined) {
        state.addRecord(performance.fitName, `${id}.fit`, spatialTypes.fit, decodeMediaFit(appearance), child.range);
        if (appearance.properties.playback !== undefined || appearance.properties["trim-start"] !== undefined || appearance.properties["trim-end"] !== undefined) {
          throw new Error(`${child.name} follows the performance's source time. Select its interval with during or start/end.`);
        }
        state.addRecord(performance.sampleName, `${id}.sample`, mediaTrackTypes.sampleLayerSpec,
          decodeMediaSampleSpec(appearance, "content", "timed", decodeSamplingMotion(child, true), true), child.range);
      }
      const layers = unitLayers(state, { trackId, unitSuffix: `item-${itemSuffix}`, element: child, appearance,
        ...(directSource === undefined ? {} : { directSource }), allowFramePaint: true, allowEmpty: isPerformance }, resolveReference);
      const selectedAudio = sourceAudio(child);
      const specName = `item-${itemSuffix}-spec`;
      const windowName = `item-${itemSuffix}-window`;
      state.addValue(windowName, temporal.ref, temporalTypes.window);
      state.addRecord(specName, `${trackId}.item.${itemSuffix}.spec`, mediaTrackTypes.itemSpec,
        decodeMediaItemSpec(appearance, { id,
          motion: decodeMediaMotion(motionRecipe), ...(selectedAudio === undefined ? {} : { sourceAudio: selectedAudio }) }), child.range);
      const frameName = `item-${itemSuffix}-frame`;
      state.addReference(frameName, reference(child.attributes.frame, `${child.name}.frame`, spatialTypes.frame, resolveReference));
      const fragmentSounds: FragmentSound[] = [];
      for (const soundChild of child.children) {
        if (soundChild.kind === "element" && (soundChild.name.endsWith(":Sound") || soundChild.name === "Sound")) {
          fragmentSounds.push(sound(state, soundChild, `item-${itemSuffix}`, trackId, fragmentSounds.length + 1, new Set(), resolveReference));
        }
      }
      if (selectedAudio !== undefined || fragmentSounds.length > 0) hasAudio = true;
      items.push({ suffix: itemSuffix, windowName, frameName, specName, ...(performance === undefined ? {} : { performance }),
        ...(clipPathName === undefined ? {} : { clipPathName }), layers, sounds: fragmentSounds });
      continue;
    }
    if (!(child.name.endsWith(":Sequence") || child.name === "Sequence")) {
      throw new Error(`${element.name} accepts only Performance, Item and Sequence children.`);
    }
    sequenceIndex += 1;
    const sequenceSuffix = suffix(sequenceIndex);
    allowed(child, ["id", "frame", "clip", "appearance", "motion", "until", "until-boundary"]);
    const id = optionalText(child, "id") ?? `${trackId}.sequence.${sequenceSuffix}`;
    const appearance = recipe(reference(child.attributes.appearance, `${child.name}.appearance`, svsRecipeType, resolveReference), `${child.name}.appearance`);
    const clipPathName = child.attributes.clip === undefined ? undefined : `sequence-${sequenceSuffix}-clip-path`;
    if (clipPathName !== undefined) {
      if (appearance.properties.clip !== undefined) throw new Error(`${child.name} cannot combine clip={Path} with Recipe clip.`);
      state.addReference(clipPathName, reference(child.attributes.clip, `${child.name}.clip`, spatialTypes.path, resolveReference));
    }
    const motionRecipe = child.attributes.motion === undefined ? undefined
      : recipe(reference(child.attributes.motion, `${child.name}.motion`, svsRecipeType, resolveReference), `${child.name}.motion`);
    const memberElements = child.children.filter((node): node is StructuredElement => node.kind === "element" && (node.name.endsWith(":Member") || node.name === "Member"));
    if (memberElements.length < 2) throw new Error(`${child.name} requires at least two Member children.`);
    const memberIds = memberElements.map((member, index) => optionalText(member, "id") ?? `${id}.member.${suffix(index + 1)}`);
    const handoffElements = child.children.filter((node): node is StructuredElement => node.kind === "element" && (node.name.endsWith(":Handoff") || node.name === "Handoff"));
    if (handoffElements.length !== memberIds.length - 1) throw new Error(`${child.name} requires exactly one Handoff for every adjacent Member pair.`);
    const handoffs: MediaHandoffSpec[] = [];
    for (const [index, handoff] of handoffElements.entries()) {
      allowed(handoff, ["id", "from", "transition"]);
      empty(handoff);
      const from = text(handoff, "from");
      if (from !== memberIds[index]) throw new Error(`${handoff.name}.from must name Member ${memberIds[index]}.`);
      const handoffId = optionalText(handoff, "id") ?? `${id}.handoff.${suffix(index + 1)}`;
      const transition = recipe(reference(handoff.attributes.transition, `${handoff.name}.transition`, svsRecipeType, resolveReference), `${handoff.name}.transition`);
      handoffs.push(decodeMediaHandoffSpec(transition, handoffId, from, memberIds[index + 1]!));
    }
    const handoffIds = new Set(handoffs.map((handoff) => handoff.id));
    const members: FragmentMember[] = [];
    for (const [index, member] of memberElements.entries()) {
      const memberSuffix = suffix(index + 1);
      allowed(member, ["id", "image", "media", "surface", "extent", "appearance", ...temporalInstantAttributeNames, "source-audio", "audio-gain"]);
      const temporal = createTemporalInstantProjection({ id: `${id}.${memberIds[index]}`, subjectId: memberIds[index]!, element: member, ...context, space: time.space, resolveReference });
      state.records.push(...temporal.records); temporalComponents.push(...temporal.components); temporalFragments.push(...temporal.fragments);
      const memberAppearance = member.attributes.appearance === undefined ? appearance
        : recipe(reference(member.attributes.appearance, `${member.name}.appearance`, svsRecipeType, resolveReference), `${member.name}.appearance`);
      const directSource = declaredVisualSource(member, resolveReference);
      validateUnitChildren(member, directSource !== undefined, false);
      const unitSuffix = `sequence-${sequenceSuffix}-member-${memberSuffix}`;
      const layers = unitLayers(state, { trackId, unitSuffix, element: member, appearance: memberAppearance,
        ...(directSource === undefined ? {} : { directSource }), allowFramePaint: true }, resolveReference);
      const selectedAudio = sourceAudio(member);
      if (selectedAudio !== undefined) hasAudio = true;
      const specName = `${unitSuffix}-spec`;
      state.addRecord(specName, `${trackId}.${unitSuffix}.spec`, mediaTrackTypes.memberSpec,
        sealMediaSequenceMemberSpec({ id: memberIds[index]!,
          ...(selectedAudio === undefined ? {} : { sourceAudio: selectedAudio }) }), member.range);
      const instantName = `${unitSuffix}-instant`;
      state.addValue(instantName, temporal.ref, temporalTypes.instant);
      members.push({ suffix: memberSuffix, instantName, specName, layers });
    }
    const sequenceSounds: FragmentSound[] = [];
    for (const soundChild of child.children) {
      if (soundChild.kind === "element" && (soundChild.name.endsWith(":Sound") || soundChild.name === "Sound")) {
        sequenceSounds.push(sound(state, soundChild, `sequence-${sequenceSuffix}`, trackId, sequenceSounds.length + 1, handoffIds, resolveReference));
      } else if (soundChild.kind === "element" && !(
        soundChild.name.endsWith(":Member") || soundChild.name === "Member"
        || soundChild.name.endsWith(":Handoff") || soundChild.name === "Handoff"
      )) throw new Error(`${child.name} accepts only Member, Handoff and Sound children.`);
    }
    if (sequenceSounds.length > 0) hasAudio = true;
    const terminalTemporal = createTemporalInstantProjection({
      id: `${id}.terminal`, subjectId: id, element: child, ...context, space: time.space, resolveReference,
      semanticAttribute: "until", boundaryAttribute: "until-boundary", projectedAttribute: false,
      boundaryFallback: "end",
    });
    state.records.push(...terminalTemporal.records); temporalComponents.push(...terminalTemporal.components); temporalFragments.push(...terminalTemporal.fragments);
    const frameName = `sequence-${sequenceSuffix}-frame`;
    state.addReference(frameName, reference(child.attributes.frame, `${child.name}.frame`, spatialTypes.frame, resolveReference));
    const specName = `sequence-${sequenceSuffix}-spec`;
    state.addRecord(specName, `${trackId}.sequence.${sequenceSuffix}.spec`, mediaTrackTypes.sequenceSpec,
      decodeMediaSequenceSpec(appearance, id, decodeMediaMotion(motionRecipe), handoffs), child.range);
    const terminalName = `sequence-${sequenceSuffix}-terminal`;
    state.addValue(terminalName, terminalTemporal.ref, temporalTypes.instant);
    sequences.push({ suffix: sequenceSuffix, terminalName, frameName, specName,
      ...(clipPathName === undefined ? {} : { clipPathName }), members, sounds: sequenceSounds });
  }
  if (items.length === 0 && sequences.length === 0) throw new Error(`${element.name} requires at least one Performance, Item or Sequence.`);
  const fragment = createMediaTrackSurfaceFragment(state.inputTypes, items, sequences, hasAudio);
  return {
    records: state.records,
    components: [...temporalComponents, { id: trackId, fragment: fragment.id, inputs: state.inputs,
      outputs: { program: `${trackId}.program`, visual: `${trackId}.visual`, ...(hasAudio ? { audio: `${trackId}.audio` } : {}) }, range: element.range }],
    fragments: [...temporalFragments, fragment],
    exports: [`${trackId}.program`, `${trackId}.visual`, ...(hasAudio ? [`${trackId}.audio`] : [])],
  };
};

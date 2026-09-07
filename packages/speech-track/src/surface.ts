import {
  localName,
  textAttribute as stringAttribute,
  type StructuredElement,
  type StructuredSurfaceHandler,
  type SurfaceResolvedReference,
  type MarkupAttributeValue,
} from "@hypit/markup";
import { sameType } from "@hypit/protocol";
import { speechTypes } from "@hypit/speech";
import {
  decodeMediaFramePaint,
  decodeMediaMotion,
  decodeMediaPresentation,
  decodeMediaSamplingKeyframe,
  decodeMediaSampleAppearance,
  mediaAppearanceKeys,
} from "@hypit/media-track";
import type { MediaSamplingMotion } from "@hypit/media-track";
import type { SvsRecipe } from "@hypit/svs";
import { svsRecipeType } from "@hypit/svs";

import { createSpeechTrackFragment } from "./fragment.js";
import { speechTrackTypes } from "./manifest.js";
import { sealSpeechTrackHeader, sealSpeechTrackVisualSpec } from "./program.js";
import {
  contentFitPropertyNames,
  decodeContentFitProperties,
  spatialTypes,
} from "@hypit/spatial";

function allowedAttributes(element: StructuredElement, required: readonly string[], optional: readonly string[]): void {
  const keys = Object.keys(element.attributes);
  const missing = required.filter((name) => !keys.includes(name));
  const unknown = keys.filter((name) => !required.includes(name) && !optional.includes(name));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`${element.name} requires ${required.join(", ")}${optional.length === 0 ? "" : ` and optionally ${optional.join(", ")}`}`);
  }
}

function integerAttribute(element: StructuredElement, name: string): number {
  const raw = stringAttribute(element, name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer`);
  return value;
}

function referencePath(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || !value.path) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return value.path;
}

function resolve(
  element: StructuredElement,
  name: string,
  expected: SurfaceResolvedReference["type"],
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const path = referencePath(element, name);
  const value = resolveReference(path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${path}`);
  if (!sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong type`);
  return value;
}

const visualAppearancePropertyNames = [
  ...contentFitPropertyNames,
  ...mediaAppearanceKeys.sample.filter((name) => name !== "playback" && name !== "trim-start" && name !== "trim-end"),
  ...mediaAppearanceKeys.frame.filter((name) => name !== "stack-order"),
] as readonly string[];
const visualMotionPropertyNames = mediaAppearanceKeys.motion.filter(
  (name) => name !== "enter-origin" && name !== "exit-origin",
);

function recipe(value: SurfaceResolvedReference, label: string, allowed: readonly string[]): SvsRecipe {
  if (!sameType(value.type, svsRecipeType) || value.record?.value.kind !== "inline") {
    throw new Error(`${label} must be an authored SVS Recipe`);
  }
  const result = value.record.value.value as unknown as SvsRecipe;
  const unknown = Object.keys(result.properties).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) throw new Error(`${label} has unsupported properties ${unknown.join(", ")}`);
  return result;
}

function takes(element: StructuredElement): StructuredElement[] {
  const result: StructuredElement[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Take children`);
      continue;
    }
    if (localName(child.name) !== "Take") throw new Error(`${element.name} accepts only Take children`);
    result.push(child);
  }
  if (result.length === 0) throw new Error(`${element.name} requires at least one Take`);
  return result;
}

function samplingMotion(element: StructuredElement): MediaSamplingMotion | undefined {
  const keyframes = element.children.flatMap((child) => {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Sampling children`);
      return [];
    }
    if (localName(child.name) !== "Sampling") {
      throw new Error(`${element.name} accepts only Sampling children`);
    }
    return [decodeMediaSamplingKeyframe(child)];
  });
  return keyframes.length === 0 ? undefined : { keyframes };
}

export const decodeSpeechTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowedAttributes(element, ["id", "visual-frame", "visual-appearance", "visual-z"], ["visual-motion"]);
  const id = stringAttribute(element, "id");
  const baseFrame = resolve(element, "visual-frame", spatialTypes.frame, resolveReference);
  const baseAppearanceReference = resolve(element, "visual-appearance", svsRecipeType, resolveReference);
  const baseAppearance = recipe(
    baseAppearanceReference,
    `${element.name}.visual-appearance`,
    visualAppearancePropertyNames,
  );
  const baseZ = integerAttribute(element, "visual-z");
  const baseMotionReference = element.attributes["visual-motion"] === undefined
    ? undefined
    : resolve(element, "visual-motion", svsRecipeType, resolveReference);
  const baseMotion = baseMotionReference === undefined
    ? undefined
    : recipe(baseMotionReference, `${element.name}.visual-motion`, visualMotionPropertyNames);
  const frameInputNames = new Map<string, string>();
  const frameInputName = (value: SurfaceResolvedReference, fallback: string): string => {
    const key = JSON.stringify(value.ref);
    const previous = frameInputNames.get(key);
    if (previous !== undefined) return previous;
    frameInputNames.set(key, fallback);
    return fallback;
  };
  const fitInputNames = new Map<string, string>();
  const fitInputName = (value: SurfaceResolvedReference, fallback: string): string => {
    const key = JSON.stringify(value.ref);
    const previous = fitInputNames.get(key);
    if (previous !== undefined) return previous;
    fitInputNames.set(key, fallback);
    return fallback;
  };
  const visualSpecInputNames = new Map<string, string>();
  const visualSpecInputName = (spec: ReturnType<typeof sealSpeechTrackVisualSpec>, fallback: string): string => {
    const key = JSON.stringify(spec);
    const previous = visualSpecInputNames.get(key);
    if (previous !== undefined) return previous;
    visualSpecInputNames.set(key, fallback);
    return fallback;
  };
  const declaredTakes = takes(element).map((take, index) => {
    allowedAttributes(take, ["source"], ["frame", "appearance", "motion", "z"]);
    const suffix = String(index + 1).padStart(4, "0");
    const effectiveFrame = take.attributes.frame === undefined
      ? baseFrame
      : resolve(take, "frame", spatialTypes.frame, resolveReference);
    const effectiveAppearanceReference = take.attributes.appearance === undefined
      ? baseAppearanceReference
      : resolve(take, "appearance", svsRecipeType, resolveReference);
    const effectiveAppearance = take.attributes.appearance === undefined
      ? baseAppearance
      : recipe(effectiveAppearanceReference, `${take.name}.appearance`, visualAppearancePropertyNames);
    const effectiveZ = take.attributes.z === undefined ? baseZ : integerAttribute(take, "z");
    const effectiveMotionReference = take.attributes.motion === undefined
      ? baseMotionReference
      : resolve(take, "motion", svsRecipeType, resolveReference);
    const effectiveMotion = take.attributes.motion === undefined
      ? baseMotion
      : recipe(effectiveMotionReference!, `${take.name}.motion`, visualMotionPropertyNames);
    const effectiveSamplingMotion = samplingMotion(take);
    const framePaint = decodeMediaFramePaint(effectiveAppearance, `${id}.take.${suffix}.frame-paint`);
    const visualSpec = sealSpeechTrackVisualSpec({
      stackingOrder: effectiveZ,
      presentation: decodeMediaPresentation(effectiveAppearance),
      sampleAppearance: decodeMediaSampleAppearance(effectiveAppearance),
      motion: decodeMediaMotion(effectiveMotion),
      ...(framePaint === undefined ? {} : { framePaint }),
      ...(effectiveSamplingMotion === undefined ? {} : { samplingMotion: effectiveSamplingMotion }),
    });
    const visual = {
      frameName: frameInputName(effectiveFrame, take.attributes.frame === undefined ? "visual-base-frame" : `take-${suffix}-frame`),
      fitName: fitInputName(effectiveAppearanceReference, take.attributes.appearance === undefined ? "visual-base-fit" : `take-${suffix}-fit`),
      visualSpecName: visualSpecInputName(visualSpec, `take-${suffix}-visual-spec`),
      frame: effectiveFrame,
      appearance: effectiveAppearance,
      spec: visualSpec,
    };
    return {
      suffix,
      takeName: `take-${suffix}`,
      source: resolve(take, "source", speechTypes.semanticTake, resolveReference),
      visual,
      range: take.range,
    };
  });
  const headerId = `${id}.header`;
  const header = sealSpeechTrackHeader({ id });
  const assembly = createSpeechTrackFragment({
    takes: declaredTakes.map(({ takeName, visual }) => ({
      takeName,
      visual: {
        frameName: visual.frameName,
        fitName: visual.fitName,
        visualSpecName: visual.visualSpecName,
      },
    })),
  });
  const emittedFits = new Set<string>();
  const emittedSpecs = new Set<string>();
  const visualRecords = declaredTakes.flatMap((take) => {
    if (take.visual === undefined) return [];
    const records = [];
    if (!emittedFits.has(take.visual.fitName)) {
      emittedFits.add(take.visual.fitName);
      records.push({
        id: `${id}.${take.visual.fitName}`,
        type: spatialTypes.fit,
        value: { kind: "inline" as const, value: decodeContentFitProperties(
          take.visual.appearance.properties,
          `Speech visual Recipe ${take.visual.appearance.path}`,
        ) },
        range: take.range,
      });
    }
    if (!emittedSpecs.has(take.visual.visualSpecName)) {
      emittedSpecs.add(take.visual.visualSpecName);
      records.push({
        id: `${id}.${take.visual.visualSpecName}`,
        type: speechTrackTypes.visualSpec,
        value: { kind: "inline" as const, value: take.visual.spec },
        range: take.range,
      });
    }
    return records;
  });
  return {
    records: [
      { id: headerId, type: speechTrackTypes.header, value: { kind: "inline", value: header }, range: element.range },
      ...visualRecords,
    ],
    components: [
      {
        id,
        fragment: assembly.id,
        inputs: {
          header: { kind: "record", id: headerId },
          ...Object.fromEntries(declaredTakes.flatMap((take) => [
            [take.takeName, take.source.ref],
            ...(take.visual === undefined ? [] : [
              [take.visual.frameName, take.visual.frame.ref],
              [take.visual.fitName, { kind: "record" as const, id: `${id}.${take.visual.fitName}` }],
              [take.visual.visualSpecName, { kind: "record" as const, id: `${id}.${take.visual.visualSpecName}` }],
            ]),
          ])),
        },
        outputs: {
          semantic: `${id}.semantic`,
          visual: `${id}.visual`,
          audio: `${id}.audio`,
        },
        range: element.range,
      },
    ],
    fragments: [assembly],
    exports: [
      `${id}.semantic`, `${id}.visual`, `${id}.audio`,
    ],
  };
};

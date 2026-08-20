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
import { programSpaceTypes, type ProgramClock } from "@hypit/program-space";
import type { SvsRecipe } from "@hypit/svs";
import { svsRecipeType } from "@hypit/svs";

import { createSpeechSpineFragment } from "./fragment.js";
import { speechSpineTypes } from "./manifest.js";
import { sealSpeechSpineProgram, sealSpeechSpineVisualSpec } from "./program.js";
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

function frameRate(element: StructuredElement): { readonly numerator: number; readonly denominator: number } {
  const value = stringAttribute(element, "frame-rate");
  const match = /^(\d+)(?:\/(\d+))?$/u.exec(value);
  if (match === null) throw new Error(`${element.name}.frame-rate must be a positive rational such as 30 or 30000/1001`);
  const numerator = Number(match[1]);
  const denominator = Number(match[2] ?? "1");
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error(`${element.name}.frame-rate is invalid`);
  }
  return { numerator, denominator };
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

function recipe(value: SurfaceResolvedReference, label: string): SvsRecipe {
  if (!sameType(value.type, svsRecipeType) || value.record?.value.kind !== "inline") {
    throw new Error(`${label} must be an authored SVS Recipe`);
  }
  const result = value.record.value.value as unknown as SvsRecipe;
  const unknown = Object.keys(result.properties).filter((name) => !contentFitPropertyNames.includes(
    name as (typeof contentFitPropertyNames)[number],
  ));
  if (unknown.length > 0) throw new Error(`${label} only accepts spatial fit properties; found ${unknown.join(", ")}`);
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

export const decodeSpeechSpineSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowedAttributes(element, ["id", "visual-frame", "visual-appearance", "visual-z"], ["clock", "frame-rate"]);
  const hasClock = element.attributes.clock !== undefined;
  const hasFrameRate = element.attributes["frame-rate"] !== undefined;
  if (hasClock === hasFrameRate) throw new Error(`${element.name} requires exactly one of clock or frame-rate.`);
  const id = stringAttribute(element, "id");
  const baseFrame = resolve(element, "visual-frame", spatialTypes.frame, resolveReference);
  const baseAppearanceReference = resolve(element, "visual-appearance", svsRecipeType, resolveReference);
  const baseAppearance = recipe(
    baseAppearanceReference,
    `${element.name}.visual-appearance`,
  );
  const baseZ = integerAttribute(element, "visual-z");
  const rate = hasClock
    ? (() => {
        const clock = resolve(element, "clock", programSpaceTypes.clock, resolveReference);
        if (clock.record?.value.kind !== "inline") throw new Error(`${element.name}.clock must be an authored Clock record.`);
        return (clock.record.value.value as unknown as ProgramClock).frameRate;
      })()
    : frameRate(element);
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
  const visualSpecInputNames = new Map<number, string>();
  const visualSpecInputName = (stackingOrder: number, fallback: string): string => {
    const previous = visualSpecInputNames.get(stackingOrder);
    if (previous !== undefined) return previous;
    visualSpecInputNames.set(stackingOrder, fallback);
    return fallback;
  };
  const declaredTakes = takes(element).map((take, index) => {
    allowedAttributes(take, ["source"], ["frame", "appearance", "z"]);
    const suffix = String(index + 1).padStart(4, "0");
    const effectiveFrame = take.attributes.frame === undefined
      ? baseFrame
      : resolve(take, "frame", spatialTypes.frame, resolveReference);
    const effectiveAppearanceReference = take.attributes.appearance === undefined
      ? baseAppearanceReference
      : resolve(take, "appearance", svsRecipeType, resolveReference);
    const effectiveAppearance = take.attributes.appearance === undefined
      ? baseAppearance
      : recipe(effectiveAppearanceReference, `${take.name}.appearance`);
    const effectiveZ = take.attributes.z === undefined ? baseZ : integerAttribute(take, "z");
    const visual = {
      frameName: frameInputName(effectiveFrame, take.attributes.frame === undefined ? "visual-base-frame" : `take-${suffix}-frame`),
      fitName: fitInputName(effectiveAppearanceReference, take.attributes.appearance === undefined ? "visual-base-fit" : `take-${suffix}-fit`),
      visualSpecName: visualSpecInputName(effectiveZ, take.attributes.z === undefined ? "visual-base-spec" : `take-${suffix}-visual-spec`),
      frame: effectiveFrame,
      appearance: effectiveAppearance,
      stackingOrder: effectiveZ,
    };
    return {
      suffix,
      takeName: `take-${suffix}`,
      source: resolve(take, "source", speechTypes.semanticTake, resolveReference),
      visual,
      range: take.range,
    };
  });
  const programId = `${id}.program`;
  const program = sealSpeechSpineProgram({

    id,
    frameRate: rate,
  });
  const assembly = createSpeechSpineFragment({
    name: `@hypit/speech-spine/surface/${id}@1`,
    takes: declaredTakes.map(({ takeName, visual }) => ({
      takeName,
      ...(visual === undefined ? {} : { visual: {
        frameName: visual.frameName,
        fitName: visual.fitName,
        visualSpecName: visual.visualSpecName,
      } }),
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
        type: speechSpineTypes.visualSpec,
        value: { kind: "inline" as const, value: sealSpeechSpineVisualSpec({

          stackingOrder: take.visual.stackingOrder,
        }) },
        range: take.range,
      });
    }
    return records;
  });
  return {
    records: [
      { id: programId, type: speechSpineTypes.spineProgram, value: { kind: "inline", value: program }, range: element.range },
      ...visualRecords,
    ],
    components: [
      {
        id,
        fragment: assembly.id,
        inputs: {
          program: { kind: "record", id: programId },
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
          basis: `${id}.basis`,
          space: `${id}.space`,
          visual: `${id}.visual`,
          audioTrack: `${id}.audioTrack`,
          semanticMap: `${id}.semanticMap`,
        },
        range: element.range,
      },
    ],
    fragments: [assembly],
    exports: [
      `${id}.basis`, `${id}.space`, `${id}.visual`, `${id}.audioTrack`,
      `${id}.semanticMap`,
    ],
  };
};

import { narrativeTypes } from "@narratage/narrative";
import { artifactTypes } from "@narratage/artifact";
import { mediaTypes } from "@narratage/media";
import {
  sealMediaSelectionRequest,
  synchronizedMediaFragment,
} from "@narratage/media-pipeline";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@narratage/markup";

import { createSpeechSpineFragment } from "./fragment.js";
import { speechSpineTypes } from "./manifest.js";
import { sealSpeechSpineProgram } from "./program.js";
import { spatialTypes } from "@narratage/spatial";

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function exactAttributes(element: StructuredElement, names: readonly string[]): void {
  if (Object.keys(element.attributes).sort().join("\u0000") !== [...names].sort().join("\u0000")) {
    throw new Error(`${element.name} requires exactly ${names.join(", ")}`);
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
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

function referencePath(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || !value.path) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return value.path;
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
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
  exactAttributes(element, ["id", "canvas", "frame-rate"]);
  const id = stringAttribute(element, "id");
  const canvas = resolve(element, "canvas", spatialTypes.canvas, resolveReference);
  const rate = frameRate(element);
  const declaredTakes = takes(element).map((take, index) => {
    const hasVideo = take.attributes.video !== undefined;
    const hasMedia = take.attributes.media !== undefined;
    if (Number(hasVideo) + Number(hasMedia) !== 1) {
      throw new Error(`${take.name} requires exactly one of video or media`);
    }
    exactAttributes(take, [hasVideo ? "video" : "media", "segment"]);
    return {
      mediaName: `take-${String(index + 1).padStart(4, "0")}-media`,
      segmentName: `take-${String(index + 1).padStart(4, "0")}-segment`,
      sourceKind: hasVideo ? "video" as const : "media" as const,
      source: resolve(take, hasVideo ? "video" : "media", hasVideo ? artifactTypes.blob : mediaTypes.synchronized, resolveReference),
      segment: resolve(take, "segment", narrativeTypes.excerpt, resolveReference),
      range: take.range,
    };
  });
  const programId = `${id}.program`;
  const requestId = `${id}.selection`;
  const program = sealSpeechSpineProgram({
    contract: "svml.speech-spine-program@1",
    id,
    frameRate: rate,
  });
  const request = sealMediaSelectionRequest({
    contract: "svml.media-selection-request@1",
    video: { mode: "primary-moving" },
    audio: { mode: "default" },
    spanAuthority: "video",
    frameRate: rate,
  });
  const assembly = createSpeechSpineFragment({
    name: `@narratage/speech-spine/surface/${id}@1`,
    takes: declaredTakes.map(({ mediaName, segmentName }) => ({ mediaName, segmentName })),
  });
  const normalizationComponents = declaredTakes.flatMap((take, index) => take.sourceKind === "media" ? [] : [{
    id: `${id}.normalize.${String(index + 1).padStart(4, "0")}`,
    fragment: synchronizedMediaFragment.id,
    inputs: { source: take.source.ref, request: { kind: "record" as const, id: requestId } },
    outputs: { media: `${id}.normalized.${String(index + 1).padStart(4, "0")}` },
    range: take.range,
  }]);
  const normalizationByTake = new Map(normalizationComponents.map((component) => [component.id.split(".").at(-1), component]));
  return {
    records: [
      { id: programId, type: speechSpineTypes.spineProgram, value: { kind: "inline", value: program }, range: element.range },
      ...(normalizationComponents.length === 0 ? [] : [{ id: requestId, type: { module: { name: "@narratage/media-pipeline", version: "1" }, name: "MediaSelectionRequest" }, value: { kind: "inline" as const, value: request }, range: element.range }]),
    ],
    components: [
      ...normalizationComponents,
      {
        id,
        fragment: assembly.id,
        inputs: {
          program: { kind: "record", id: programId },
          canvas: canvas.ref,
          ...Object.fromEntries(declaredTakes.flatMap((take, index) => [
            [take.mediaName, take.sourceKind === "media" ? take.source.ref : {
              kind: "component-output" as const,
              component: normalizationByTake.get(String(index + 1).padStart(4, "0"))!.id,
              output: "media",
            }],
            [take.segmentName, take.segment.ref],
          ])),
        },
        outputs: {
          basis: `${id}.basis`,
          space: `${id}.space`,
          audio: `${id}.audio`,
          visual: `${id}.visual`,
          audioTrack: `${id}.audioTrack`,
        },
        range: element.range,
      },
    ],
    fragments: [...(normalizationComponents.length === 0 ? [] : [synchronizedMediaFragment]), assembly],
  };
};

import { artifactTypes } from "@narratage/artifact";
import { contractTypes } from "@narratage/video-contracts";
import {
  sealMediaSelectionRequest,
  synchronizedMediaFragment,
} from "@narratage/media-pipeline";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@narratage/text";

import { createSpeechSpineFragment } from "./fragment.js";
import { speechProgramTypes } from "./manifest.js";
import { sealSpeechSpineProgram } from "./program.js";

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

function referencePath(element: StructuredElement, name: string): string {
  const value: TextAttributeValue | undefined = element.attributes[name];
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
    exactAttributes(child, ["source", "segment"]);
    result.push(child);
  }
  if (result.length === 0) throw new Error(`${element.name} requires at least one Take`);
  return result;
}

export const decodeSpeechSpineSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id"]);
  const id = stringAttribute(element, "id");
  const declaredTakes = takes(element).map((take, index) => ({
    mediaName: `take-${String(index + 1).padStart(4, "0")}-media`,
    segmentName: `take-${String(index + 1).padStart(4, "0")}-segment`,
    source: resolve(take, "source", artifactTypes.blob, resolveReference),
    segment: resolve(take, "segment", contractTypes.narrativeExcerpt, resolveReference),
    range: take.range,
  }));
  const programId = `${id}.program`;
  const requestId = `${id}.selection`;
  const program = sealSpeechSpineProgram({
    contract: "svml.speech-spine-program@1",
    id,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const request = sealMediaSelectionRequest({
    contract: "svml.media-selection-request@1",
    video: { mode: "primary-moving" },
    audio: { mode: "default" },
    spanAuthority: "video",
    frameRate: { numerator: 30, denominator: 1 },
  });
  const assembly = createSpeechSpineFragment({
    name: `@narratage/speech-program/surface/${id}@1`,
    takes: declaredTakes.map(({ mediaName, segmentName }) => ({ mediaName, segmentName })),
  });
  const normalizationComponents = declaredTakes.map((take, index) => ({
    id: `${id}.normalize.${String(index + 1).padStart(4, "0")}`,
    fragment: synchronizedMediaFragment.id,
    inputs: { source: take.source.ref, request: { kind: "record" as const, id: requestId } },
    outputs: { media: `${id}.normalized.${String(index + 1).padStart(4, "0")}` },
    range: take.range,
  }));
  return {
    records: [
      { id: programId, type: speechProgramTypes.spineProgram, value: { kind: "inline", value: program }, range: element.range },
      { id: requestId, type: { module: { name: "@narratage/media-pipeline", version: "0.0.0-dev" }, name: "MediaSelectionRequest" }, value: { kind: "inline", value: request }, range: element.range },
    ],
    components: [
      ...normalizationComponents,
      {
        id,
        fragment: assembly.id,
        inputs: {
          program: { kind: "record", id: programId },
          ...Object.fromEntries(declaredTakes.flatMap((take, index) => [
            [take.mediaName, { kind: "component-output" as const, component: normalizationComponents[index]!.id, output: "media" }],
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
    fragments: [synchronizedMediaFragment, assembly],
  };
};

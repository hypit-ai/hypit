import {
  assertEmptyElement as empty,
  localName,
  textAttribute as text,
  type StructuredElement,
  type StructuredSurfaceHandler,
  type SurfaceResolvedReference,
  type MarkupAttributeValue,
} from "@hypit/markup";
import { sameType, type CanonicalValue } from "@hypit/protocol";
import { artifactTypes } from "@hypit/artifact";
import { mediaTypes } from "@hypit/media";
import { programSpaceTypes, type ProgramClock } from "@hypit/program-space";
import { svsRecipeType, type SvsRecipe } from "@hypit/svs";

import {
  extractAudioFragment,
  extractFrameFragment,
  synchronizedMediaFragment,
  transformMediaFragment,
} from "./fragment.js";
import { mediaPipelineTypes } from "./manifest.js";
import {
  sealAudioExtractionRequest,
  sealFrameExtractionRequest,
  sealMediaTransformProgram,
} from "./operations.js";
import { sealMediaSelectionRequest } from "./selection.js";
import type {
  AudioExtractionRequest,
  FrameExtractionRequest,
  MediaSelectionRequest,
  MediaTransformOperation,
} from "./types.js";

function ref(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, artifactTypes.blob)) throw new Error(`${label} must resolve to BlobArtifact.`);
  return value;
}

function typedReference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: SurfaceResolvedReference["type"],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function authoredRecipe(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SvsRecipe {
  const value = typedReference(raw, label, svsRecipeType, resolve);
  if (value.record?.value.kind !== "inline") throw new Error(`${label} must be an authored SVS Recipe.`);
  const recipe = value.record.value.value as unknown as SvsRecipe;
  const unknown = Object.keys(recipe.properties).filter((name) => !["audio", "span-authority", "video"].includes(name));
  if (unknown.length > 0) throw new Error(`${label} only accepts video, audio and span-authority; found ${unknown.join(", ")}.`);
  return recipe;
}

function recipeText(recipe: SvsRecipe, name: string, label: string): string {
  const value: CanonicalValue | undefined = recipe.properties[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} requires string property ${name}.`);
  }
  return value;
}

function stream(value: string, kind: "video"): MediaSelectionRequest["video"];
function stream(value: string, kind: "audio"): MediaSelectionRequest["audio"];
function stream(value: string, kind: "video" | "audio"): MediaSelectionRequest["video"] | MediaSelectionRequest["audio"] {
  if (kind === "video" && value === "primary-moving") return { mode: "primary-moving" };
  if (kind === "audio" && value === "default") return { mode: "default" };
  if (value === "none") return { mode: "none" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) throw new Error(`${kind} must be ${kind === "video" ? "primary-moving" : "default"}, none or stream:<index>.`);
  return { mode: "stream-index", streamIndex: Number(match[1]) };
}

function frameRate(value: string): { readonly numerator: number; readonly denominator: number } {
  const match = /^(\d+)(?:\/(\d+))?$/u.exec(value);
  if (match === null) throw new Error("Normalize.frame-rate must be a positive rational such as 30 or 30000/1001.");
  const numerator = Number(match[1]);
  const denominator = Number(match[2] ?? "1");
  if (!Number.isSafeInteger(numerator) || numerator < 1 || !Number.isSafeInteger(denominator) || denominator < 1) {
    throw new Error("Normalize.frame-rate is invalid.");
  }
  return { numerator, denominator };
}

function exactAttributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const expected = new Set([...required, ...optional]);
  const unknown = Object.keys(element.attributes).filter((name) => !expected.has(name));
  if (unknown.length > 0 || required.some((name) => element.attributes[name] === undefined)) {
    throw new Error(`${element.name} requires ${required.join(", ")}`
      + (optional.length === 0 ? "" : `; optional: ${optional.join(", ")}`));
  }
}

function seconds(value: string, subject: string, allowZero = true): number {
  const match = /^(\d+(?:\.\d+)?)(?:s)?$/u.exec(value.trim());
  if (match === null) throw new Error(`${subject} must be seconds such as 0.25s or 2`);
  const result = Number(match[1]);
  if (!Number.isFinite(result) || result < 0 || (!allowZero && result === 0)) {
    throw new Error(`${subject} must be ${allowZero ? "non-negative" : "positive"}`);
  }
  return result;
}

function audioSelector(value: string): AudioExtractionRequest["audio"] {
  if (value === "default") return { mode: "default" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) throw new Error("ExtractAudio.audio must be default or stream:<index>.");
  return { mode: "stream-index", streamIndex: Number(match[1]) };
}

function videoSelector(value: string): FrameExtractionRequest["video"] {
  if (value === "primary-moving") return { mode: "primary-moving" };
  const match = /^stream:(\d+)$/u.exec(value);
  if (match === null) throw new Error("video must be primary-moving or stream:<index>.");
  return { mode: "stream-index", streamIndex: Number(match[1]) };
}

function transformOperations(element: StructuredElement): readonly MediaTransformOperation[] {
  const result: MediaTransformOperation[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Trim and Retime children.`);
      continue;
    }
    const name = localName(child.name);
    empty(child);
    if (name === "Trim") {
      exactAttributes(child, [], ["start", "end", "tail"]);
      const start = child.attributes.start;
      const end = child.attributes.end;
      const tail = child.attributes.tail;
      if (start === undefined && end === undefined && tail === undefined) {
        throw new Error(`${child.name} requires at least one of start, end or tail.`);
      }
      if (end !== undefined && tail !== undefined) throw new Error(`${child.name} cannot combine end and tail.`);
      for (const [attribute, value] of [["start", start], ["end", end], ["tail", tail]] as const) {
        if (value !== undefined && typeof value !== "string") throw new Error(`${child.name}.${attribute} must be text.`);
      }
      result.push({
        kind: "trim",
        ...(typeof start === "string" ? { startSec: seconds(start, `${child.name}.start`) } : {}),
        ...(typeof end === "string" ? { endSec: seconds(end, `${child.name}.end`, false) } : {}),
        ...(typeof tail === "string" ? { tailSec: seconds(tail, `${child.name}.tail`, false) } : {}),
      });
      continue;
    }
    if (name === "Retime") {
      exactAttributes(child, ["rate", "pitch"]);
      const rate = Number(text(child, "rate"));
      if (!Number.isFinite(rate) || rate <= 0 || rate > 100) throw new Error(`${child.name}.rate must be in (0, 100].`);
      if (text(child, "pitch") !== "preserve") throw new Error(`${child.name}.pitch must be preserve.`);
      result.push({ kind: "retime", rate, pitch: "preserve" });
      continue;
    }
    throw new Error(`${element.name} accepts only Trim and Retime children.`);
  }
  if (result.length === 0) throw new Error(`${element.name} requires at least one Trim or Retime child.`);
  return result;
}

export const decodeSynchronizedMediaSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const required = ["id", "source"];
  const optional = ["audio", "clock", "frame-rate", "recipe", "span-authority", "video"];
  exactAttributes(element, required, optional);
  const hasClock = element.attributes.clock !== undefined;
  const hasFrameRate = element.attributes["frame-rate"] !== undefined;
  if (hasClock === hasFrameRate) throw new Error(`${element.name} requires exactly one of clock or frame-rate.`);
  const hasRecipe = element.attributes.recipe !== undefined;
  const policyCount = ["video", "audio", "span-authority"].filter((name) => element.attributes[name] !== undefined).length;
  if ((hasRecipe && policyCount !== 0) || (!hasRecipe && policyCount !== 3)) {
    throw new Error(`${element.name} requires exactly one of recipe or video/audio/span-authority.`);
  }
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty.`);
  }
  const id = text(element, "id");
  const source = ref(element.attributes.source, `${element.name}.source`, resolveReference);
  const clock = hasClock
    ? typedReference(element.attributes.clock, `${element.name}.clock`, programSpaceTypes.clock, resolveReference)
    : undefined;
  const clockValue = clock?.record?.value.kind === "inline"
    ? clock.record.value.value as unknown as ProgramClock
    : undefined;
  if (clock !== undefined && clockValue === undefined) throw new Error(`${element.name}.clock must be an authored Clock record.`);
  const normalizationRecipe = hasRecipe ? authoredRecipe(element.attributes.recipe, `${element.name}.recipe`, resolveReference) : undefined;
  const video = stream(normalizationRecipe === undefined ? text(element, "video") : recipeText(normalizationRecipe, "video", `${element.name}.recipe`), "video");
  const audio = stream(normalizationRecipe === undefined ? text(element, "audio") : recipeText(normalizationRecipe, "audio", `${element.name}.recipe`), "audio");
  const spanAuthority = normalizationRecipe === undefined
    ? text(element, "span-authority")
    : recipeText(normalizationRecipe, "span-authority", `${element.name}.recipe`);
  if (spanAuthority !== "video" && spanAuthority !== "audio") throw new Error(`${element.name}.span-authority must be video or audio.`);
  const request = sealMediaSelectionRequest({
    video,
    audio,
    spanAuthority,
    frameRate: clockValue?.frameRate ?? frameRate(text(element, "frame-rate")),
  });
  const requestId = `${id}.request`;
  return {
    records: [{ id: requestId, type: mediaPipelineTypes.selectionRequest, value: { kind: "inline", value: request }, range: element.range }],
    components: [{
      id,
      fragment: synchronizedMediaFragment.id,
      inputs: { source: source.ref, request: { kind: "record", id: requestId } },
      outputs: { media: `${id}.media` },
      range: element.range,
    }],
    fragments: [synchronizedMediaFragment],
  };
};

export const decodeTransformMediaSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "source"]);
  const id = text(element, "id");
  const source = typedReference(element.attributes.source, `${element.name}.source`, mediaTypes.synchronized, resolveReference);
  const program = sealMediaTransformProgram({
    operations: transformOperations(element),
  });
  const programId = `${id}.program`;
  return {
    records: [
      { id: programId, type: mediaPipelineTypes.transformProgram, value: { kind: "inline", value: program }, range: element.range },
    ],
    components: [{
      id,
      fragment: transformMediaFragment.id,
      inputs: {
        media: source.ref,
        program: { kind: "record", id: programId },
      },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    fragments: [transformMediaFragment],
  };
};

export const decodeExtractAudioSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "source", "audio"]);
  empty(element);
  const id = text(element, "id");
  const source = ref(element.attributes.source, `${element.name}.source`, resolveReference);
  const request = sealAudioExtractionRequest({
    audio: audioSelector(text(element, "audio")),
    output: { container: "wav", codec: "pcm_s16le", sampleRate: 48_000, channels: 2 },
  });
  const requestId = `${id}.request`;
  return {
    records: [{ id: requestId, type: mediaPipelineTypes.audioExtractionRequest,
      value: { kind: "inline", value: request }, range: element.range }],
    components: [{
      id,
      fragment: extractAudioFragment.id,
      inputs: { source: source.ref, request: { kind: "record", id: requestId } },
      outputs: { audio: `${id}.audio` },
      range: element.range,
    }],
    fragments: [extractAudioFragment],
  };
};

function frameSelector(value: string, subject: string): FrameExtractionRequest["at"] {
  if (value === "first") return { kind: "first" };
  if (value === "last") return { kind: "last" };
  const frame = /^frame:(\d+)$/u.exec(value);
  if (frame !== null) return { kind: "frame", index: Number(frame[1]) };
  const time = /^time:(.+)$/u.exec(value);
  if (time !== null) return { kind: "time", seconds: seconds(time[1]!, subject) };
  throw new Error(`${subject} must be first, last, frame:<index> or time:<seconds>.`);
}

export const decodeExtractFrameSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exactAttributes(element, ["id", "source", "video", "at"]);
  empty(element);
  const id = text(element, "id");
  const source = ref(element.attributes.source, `${element.name}.source`, resolveReference);
  const request = sealFrameExtractionRequest({
    video: videoSelector(text(element, "video")),
    at: frameSelector(text(element, "at"), `${element.name}.at`),
    output: { format: "png" },
  });
  const requestId = `${id}.request`;
  return {
    records: [{ id: requestId, type: mediaPipelineTypes.frameExtractionRequest,
      value: { kind: "inline", value: request }, range: element.range }],
    components: [{
      id,
      fragment: extractFrameFragment.id,
      inputs: { source: source.ref, request: { kind: "record", id: requestId } },
      outputs: { image: `${id}.image` },
      range: element.range,
    }],
    fragments: [extractFrameFragment],
  };
};

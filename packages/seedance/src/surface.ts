import { artifactTypes } from "@svml/artifact";
import { contractTypes } from "@svml/contracts";
import type { BlobRef, CanonicalValue } from "@svml/protocol";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@svml/text";

import {
  createSeedanceGenerationFragment,
  createSeedanceSpeechGenerationFragment,
} from "./fragment.js";
import {
  sealSeedancePrompt,
  sealSeedanceRequest,
  sealSeedanceSpeechProgram,
  seedanceEndpoints,
  seedanceSpeechCompileProducers,
  seedanceTypes,
  verifySeedancePrompt,
} from "./index.js";
import type {
  SeedanceModel,
  SeedancePrompt,
  SeedanceReference,
} from "./index.js";

type ReferenceInput = SeedanceReference & { readonly role?: string };

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function attributes(
  element: StructuredElement,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.has(name));
  if (unknown.length > 0 || required.some((name) => element.attributes[name] === undefined)) {
    throw new Error(
      `${element.name} requires ${required.join(", ")}`
      + (optional.length === 0 ? "" : `; optional: ${optional.join(", ")}`),
    );
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalStringAttribute(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function referenceAttribute(element: StructuredElement, name: string): string {
  const value: TextAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || value.path.length === 0) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return value.path;
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function resolved(
  element: StructuredElement,
  name: string,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const path = referenceAttribute(element, name);
  const value = resolveReference(path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${path}`);
  return value;
}

function inline(reference: SurfaceResolvedReference, subject: string): CanonicalValue {
  const value = reference.record?.value;
  if (value?.kind !== "inline") throw new Error(`${subject} must reference an authored value declared before use`);
  return value.value;
}

function prompt(reference: SurfaceResolvedReference, subject: string): SeedancePrompt {
  if (!sameType(reference.type, seedanceTypes.prompt)) throw new Error(`${subject} must reference a Seedance Prompt`);
  const value = inline(reference, subject);
  verifySeedancePrompt(value);
  return value;
}

function blob(reference: SurfaceResolvedReference, subject: string): BlobRef {
  if (!sameType(reference.type, artifactTypes.blob)) throw new Error(`${subject} must reference a BlobArtifact`);
  const value = reference.record?.value;
  if (value?.kind !== "blob") throw new Error(`${subject} must reference an authored artifact declared before use`);
  return value;
}

function normalizedText(element: StructuredElement): string {
  if (element.children.some((child) => child.kind === "element")) {
    throw new Error(`${element.name} accepts text only`);
  }
  const raw = element.children.map((child) => child.kind === "text" ? child.value : "").join("");
  const lines = raw.replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim();
}

function modelSelection(element: StructuredElement) {
  const requested = stringAttribute(element, "model");
  if (requested === "standard" || requested === "seedance-2") {
    return { endpoint: seedanceEndpoints.standard!, model: "seedance-2" as const };
  }
  if (requested === "fast" || requested === "seedance-2-fast") {
    return { endpoint: seedanceEndpoints.fast!, model: "seedance-2-fast" as const };
  }
  if (requested === "mini" || requested === "seedance-2-mini") {
    return { endpoint: seedanceEndpoints.mini!, model: "seedance-2-mini" as const };
  }
  throw new Error(`${element.name}.model must be standard, fast or mini`);
}

function integerAttribute(element: StructuredElement, name: string): number {
  const value = Number(stringAttribute(element, name));
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer`);
  return value;
}

function booleanAttribute(element: StructuredElement, name: string, fallback: boolean): boolean {
  const value = optionalStringAttribute(element, name);
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${element.name}.${name} must be true or false`);
}

function generationSettings(
  element: StructuredElement,
  model: SeedanceModel,
  suppliedDurationSec?: number,
): {
  readonly durationSec: number;
  readonly resolution: "480p" | "720p" | "1080p";
  readonly aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" | "adaptive";
  readonly webSearch: boolean;
} {
  const durationSec = suppliedDurationSec ?? integerAttribute(element, "duration");
  if (durationSec < 4 || durationSec > 15) {
    throw new Error(`${element.name}.duration must be between 4 and 15 seconds`);
  }
  const resolution = optionalStringAttribute(element, "resolution") ?? "720p";
  if (resolution !== "480p" && resolution !== "720p" && resolution !== "1080p") {
    throw new Error(`${element.name}.resolution must be 480p, 720p or 1080p`);
  }
  if (resolution === "1080p" && model !== "seedance-2") {
    throw new Error(`${element.name}.resolution 1080p is available only for the standard model`);
  }
  const aspectRatio = optionalStringAttribute(element, "aspect-ratio") ?? "9:16";
  if (!["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"].includes(aspectRatio)) {
    throw new Error(`${element.name}.aspect-ratio is not supported by Seedance`);
  }
  return {
    durationSec,
    resolution,
    aspectRatio: aspectRatio as "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" | "adaptive",
    webSearch: booleanAttribute(element, "web-search", false),
  };
}

function references(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): ReferenceInput[] {
  const result: ReferenceInput[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Reference children`);
      continue;
    }
    if (localName(child.name) !== "Reference") throw new Error(`${element.name} accepts only Reference children`);
    attributes(child, [], ["image", "video", "audio", "role"]);
    const kinds = (["image", "video", "audio"] as const).filter((kind) => child.attributes[kind] !== undefined);
    if (kinds.length !== 1) throw new Error(`${child.name} requires exactly one of image, video or audio`);
    const kind = kinds[0]!;
    const source = resolved(child, kind, resolveReference);
    const artifact = blob(source, `${child.name}.${kind}`);
    if (!artifact.mediaType.startsWith(`${kind}/`)) {
      throw new Error(`${child.name}.${kind} must reference ${kind} media`);
    }
    const role = optionalStringAttribute(child, "role");
    result.push({ kind, artifact, ...(role === undefined ? {} : { role }) });
  }
  if (result.length > 12) throw new Error(`${element.name} accepts at most 12 references`);
  return result;
}

function referencePrompt(values: readonly ReferenceInput[]): string {
  const roles = values.flatMap((item, index) => item.role === undefined
    ? []
    : [`Reference ${item.kind} ${index + 1} is the ${item.role}.`]);
  return roles.length === 0 ? "" : `\n\nReference roles:\n${roles.join("\n")}`;
}

function dialogueExcerpt(reference: SurfaceResolvedReference, subject: string): { readonly dialogue: string } {
  if (!sameType(reference.type, contractTypes.narrativeDialogueExcerpt)) {
    throw new Error(`${subject} must reference a NarrativeDialogueExcerpt such as script.segment.opening.dialogue`);
  }
  const value = inline(reference, subject) as unknown as {
    readonly contract: string;
    readonly dialogue?: string;
    readonly [key: string]: CanonicalValue | undefined;
  };
  if (
    value.contract !== "svml.narrative-dialogue-excerpt@1"
    || typeof value.dialogue !== "string"
    || typeof value.id !== "string"
    || !Number.isSafeInteger(value.tokenStart)
    || !Number.isSafeInteger(value.tokenEndExclusive)
  ) {
    throw new Error(`${subject} NarrativeDialogueExcerpt is invalid`);
  }
  if (value.dialogue.trim().length === 0) throw new Error(`${subject} contains no spoken text`);
  return { dialogue: value.dialogue };
}

function speechDurationReference(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference | undefined {
  if (typeof element.attributes.duration === "string") return undefined;
  const result = resolved(element, "duration", resolveReference);
  if (!sameType(result.type, contractTypes.speechDuration)) {
    throw new Error(`${element.name}.duration must reference a SpeechDuration`);
  }
  return result;
}

function generationOutput(
  element: StructuredElement,
  request: ReturnType<typeof sealSeedanceRequest>,
  output: string,
) {
  const { endpoint } = modelSelection(element);
  const fragment = createSeedanceGenerationFragment(endpoint);
  const requestId = `${stringAttribute(element, "id")}.request`;
  const id = stringAttribute(element, "id");
  return {
    records: [{
      id: requestId,
      type: endpoint.requestType,
      value: { kind: "inline" as const, value: request as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [{
      id,
      fragment: fragment.id,
      inputs: { request: { kind: "record" as const, id: requestId } },
      outputs: { video: output },
      range: element.range,
    }],
    fragments: [fragment],
  };
}

export const decodeSeedancePromptSurface: StructuredSurfaceHandler = ({ element }) => {
  attributes(element, ["id"]);
  const id = stringAttribute(element, "id");
  const value = sealSeedancePrompt(normalizedText(element));
  return {
    records: [{
      id,
      type: seedanceTypes.prompt,
      value: { kind: "inline", value: value as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [],
    fragments: [],
  };
};

export const decodeSeedanceVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "model", "prompt", "duration"], [
    "resolution", "aspect-ratio", "generate-audio", "web-search",
  ]);
  const selected = modelSelection(element);
  const declaredPrompt = prompt(resolved(element, "prompt", resolveReference), `${element.name}.prompt`);
  const refs = references(element, resolveReference);
  const request = sealSeedanceRequest({
    contract: "svml.seedance-request@1",
    model: selected.model,
    prompt: declaredPrompt.text + referencePrompt(refs),
    mode: refs.length === 0
      ? { kind: "text" }
      : { kind: "reference", items: refs.map(({ role: _role, ...item }) => item) },
    ...generationSettings(element, selected.model),
    generateAudio: booleanAttribute(element, "generate-audio", false),
  });
  return generationOutput(element, request, `${stringAttribute(element, "id")}.video`);
};

export const decodeSeedanceSpeechSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "model", "dialogue", "prompt", "duration"], [
    "resolution", "aspect-ratio", "web-search",
  ]);
  const selected = modelSelection(element);
  const declaredPrompt = prompt(resolved(element, "prompt", resolveReference), `${element.name}.prompt`);
  const spoken = dialogueExcerpt(resolved(element, "dialogue", resolveReference), `${element.name}.dialogue`);
  const refs = references(element, resolveReference);
  const duration = speechDurationReference(element, resolveReference);
  const promptText = `${declaredPrompt.text}${referencePrompt(refs)}\n\nSpoken dialogue — say exactly:\n${spoken.dialogue}`;
  const mode = refs.length === 0
    ? { kind: "text" as const }
    : { kind: "reference" as const, items: refs.map(({ role: _role, ...item }) => item) };
  if (duration !== undefined) {
    const settings = generationSettings(element, selected.model, 4);
    const program = sealSeedanceSpeechProgram({
      contract: "svml.seedance-speech-program@1",
      model: selected.model,
      prompt: promptText,
      mode,
      resolution: settings.resolution,
      aspectRatio: settings.aspectRatio,
      generateAudio: true,
      webSearch: settings.webSearch,
    });
    const id = stringAttribute(element, "id");
    const programId = `${id}.program`;
    const fragment = createSeedanceSpeechGenerationFragment(
      selected.endpoint,
      seedanceSpeechCompileProducers[selected.model],
    );
    return {
      records: [{
        id: programId,
        type: seedanceTypes.speechProgram,
        value: { kind: "inline", value: program as unknown as CanonicalValue },
        range: element.range,
      }],
      components: [{
        id,
        fragment: fragment.id,
        inputs: {
          program: { kind: "record", id: programId },
          duration: duration.ref,
        },
        outputs: { video: id },
        range: element.range,
      }],
      fragments: [fragment],
    };
  }
  const request = sealSeedanceRequest({
    contract: "svml.seedance-request@1",
    model: selected.model as SeedanceModel,
    prompt: promptText,
    mode,
    ...generationSettings(element, selected.model),
    generateAudio: true,
  });
  return generationOutput(element, request, stringAttribute(element, "id"));
};

import { artifactTypes } from "@hypit/artifact";
import {
  generationPort,
  sealGenerationMediaBinding,
  sealGenerationRequestDraft,
} from "@hypit/generation";
import type {
  GenerationMediaPort,
  GenerationMediaRole,
  GenerationPortTable,
} from "@hypit/generation";
import { exactModelMediaInputNames, exactModelTextInputName } from "@hypit/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput } from "@hypit/model-kit";
import type { CanonicalValue } from "@hypit/protocol";
import { textTypes, verifyText } from "@hypit/text";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";

import { createSeedanceAssembledGenerationFragment } from "./fragment.js";
import { seedanceEndpoints, seedancePorts } from "./index.js";
import type { SeedanceModel, SeedancePortMap } from "./index.js";

type MediaInput = {
  readonly port: "referenceImage" | "referenceVideo" | "referenceAudio" | "firstFrame" | "lastFrame";
  readonly role: GenerationMediaRole;
  readonly source: SurfaceResolvedReference;
};

function localName(value: string): string {
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

function attributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.has(name));
  if (unknown.length > 0 || required.some((name) => element.attributes[name] === undefined)) {
    throw new Error(`${element.name} requires ${required.join(", ")}`
      + (optional.length === 0 ? "" : `; optional: ${optional.join(", ")}`));
  }
}

function empty(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty`);
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

function referencePath(element: StructuredElement, name: string): string {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  if (typeof value !== "object" || value.kind !== "reference" || value.path.length === 0) {
    throw new Error(`${element.name}.${name} must be a whole-value reference`);
  }
  return value.path;
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function resolved(
  element: StructuredElement,
  name: string,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const path = referencePath(element, name);
  const value = resolveReference(path);
  if (value === undefined) throw new Error(`${element.name}.${name} cannot resolve ${path}`);
  return value;
}

function prompt(reference: SurfaceResolvedReference, subject: string): void {
  if (!sameType(reference.type, textTypes.text)) throw new Error(`${subject} must reference Text`);
  const value = reference.record?.value;
  if (value !== undefined) {
    if (value.kind !== "inline") throw new Error(`${subject} has an invalid authored Text value`);
    verifyText(value.value);
  }
}

function mediaReference(
  reference: SurfaceResolvedReference,
  role: GenerationMediaRole,
  subject: string,
): SurfaceResolvedReference {
  if (!sameType(reference.type, artifactTypes.blob)) throw new Error(`${subject} must reference a BlobArtifact`);
  const value = reference.record?.value;
  if (value !== undefined && (value.kind !== "blob" || !value.mediaType.startsWith(`${role}/`))) {
    throw new Error(`${subject} must reference ${role} media`);
  }
  return reference;
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
  if (requested === "2.5" || requested === "seedance-2.5") {
    return { endpoint: seedanceEndpoints.v25!, model: "seedance-2.5" as const };
  }
  throw new Error(`${element.name}.model must be standard, fast, mini or 2.5`);
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

function enumeratedPort(table: GenerationPortTable, name: string): readonly (string | number)[] {
  const port = generationPort(table, name);
  if (port.value.kind !== "enum") throw new Error(`${table.model} port ${name} is not enumerated`);
  return port.value.values;
}

function generationSettings(
  element: StructuredElement,
  model: SeedanceModel,
): SeedancePortMap {
  const table = seedancePorts[model];
  const duration = generationPort(table, "duration");
  // The author's literal, measured beforehand; the model's declared range is the only check.
  const durationSec = integerAttribute(element, "duration");
  if (duration.value.kind === "number") {
    const { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = duration.value;
    if (durationSec < minimum || durationSec > maximum) {
      throw new Error(`${element.name}.duration must be between ${minimum} and ${maximum} seconds`);
    }
  } else if (duration.value.kind === "enum") {
    if (!duration.value.values.includes(durationSec)) {
      throw new Error(`${element.name}.duration must be -1 (auto) or between 4 and 30 seconds for ${model}`);
    }
  } else {
    throw new Error("Seedance duration port is not numeric");
  }
  const resolutions = enumeratedPort(table, "resolution");
  const resolution = optionalStringAttribute(element, "resolution") ?? "720p";
  if (!resolutions.includes(resolution)) {
    throw new Error(`${element.name}.resolution must be ${resolutions.join(", ")} for ${model}`);
  }
  const aspectRatios = enumeratedPort(table, "aspectRatio");
  const aspectRatio = optionalStringAttribute(element, "aspect-ratio") ?? "9:16";
  if (!aspectRatios.includes(aspectRatio)) throw new Error(`${element.name}.aspect-ratio is not supported by Seedance`);
  return {
    duration: [durationSec],
    resolution: [resolution],
    aspectRatio: [aspectRatio],
    generateAudio: [booleanAttribute(element, "generate-audio", false)],
    webSearch: [booleanAttribute(element, "web-search", false)],
  };
}

const REFERENCE_PORTS = {
  image: "referenceImage",
  video: "referenceVideo",
  audio: "referenceAudio",
} as const;

function referenceInputs(
  element: StructuredElement,
  model: SeedanceModel,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): MediaInput[] {
  const accepted = Object.keys(REFERENCE_PORTS) as readonly GenerationMediaRole[];
  const result: MediaInput[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Reference children`);
      continue;
    }
    if (localName(child.name) !== "Reference") throw new Error(`${element.name} accepts only Reference children`);
    attributes(child, [], accepted);
    empty(child);
    const kinds = accepted.filter((kind) => child.attributes[kind] !== undefined);
    if (kinds.length !== 1) throw new Error(`${child.name} requires exactly one of ${accepted.join(", ")}`);
    const role = kinds[0]!;
    result.push({
      role,
      port: REFERENCE_PORTS[role],
      source: mediaReference(resolved(child, role, resolveReference), role, `${child.name}.${role}`),
    });
  }
  if (result.length === 0) throw new Error(`${element.name} requires at least one Reference child`);
  const table = seedancePorts[model];
  for (const role of accepted) {
    const port = generationPort(table, REFERENCE_PORTS[role]);
    const used = result.filter((item) => item.role === role).length;
    if (used > port.maxItems) throw new Error(`${element.name} accepts at most ${port.maxItems} ${role} references`);
  }
  return result;
}

function frameInputs(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): MediaInput[] {
  const first = mediaReference(resolved(element, "first-frame", resolveReference), "image", `${element.name}.first-frame`);
  const result: MediaInput[] = [{ port: "firstFrame", role: "image", source: first }];
  if (element.attributes["last-frame"] !== undefined) {
    result.push({
      port: "lastFrame",
      role: "image",
      source: mediaReference(resolved(element, "last-frame", resolveReference), "image", `${element.name}.last-frame`),
    });
  }
  return result;
}

function assembleMedia(
  id: string,
  endpoint: ExactModelEndpoint,
  values: readonly MediaInput[],
  range: StructuredElement["range"],
) {
  const records: Array<{
    readonly id: string;
    readonly type: SurfaceResolvedReference["type"];
    readonly value: { readonly kind: "inline"; readonly value: CanonicalValue };
    readonly range: StructuredElement["range"];
  }> = [];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {};
  const mediaInputs = values.map((value, index): ExactModelMediaInput => {
    const name = `media-${String(index + 1).padStart(4, "0")}`;
    const binding = endpoint.mediaBindings[value.port];
    if (binding === undefined) throw new Error(`${endpoint.ports.model} has no media port ${value.port}`);
    const port = generationPort(endpoint.ports, value.port);
    if (port.value.kind !== "media") throw new Error(`${endpoint.ports.model} port ${value.port} is not media`);
    const bindingId = `${id}.${name}.binding`;
    records.push({
      id: bindingId,
      type: binding.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(port as GenerationMediaPort, { role: value.role }) as unknown as CanonicalValue,
      },
      range,
    });
    const names = exactModelMediaInputNames(name);
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = value.source.ref;
    return { name, port: value.port };
  });
  return { mediaInputs, records, inputs };
}

function generationOutput(args: {
  readonly element: StructuredElement;
  readonly endpoint: ExactModelEndpoint;
  readonly model: SeedanceModel;
  readonly promptSource: SurfaceResolvedReference;
  readonly media: readonly MediaInput[];
  readonly resolveReference: (path: string) => SurfaceResolvedReference | undefined;
}) {
  const { element, endpoint, model, promptSource } = args;
  const id = stringAttribute(element, "id");
  const assembled = assembleMedia(id, endpoint, args.media, element.range);
  const draft = sealGenerationRequestDraft(seedancePorts[model], generationSettings(element, model));
  const fragment = createSeedanceAssembledGenerationFragment(
    endpoint,
    assembled.mediaInputs,
    [{ name: "prompt", port: "prompt" }],
  );
  const draftId = `${id}.draft`;
  return {
    records: [{
      id: draftId,
      type: endpoint.draftType,
      value: { kind: "inline" as const, value: draft as unknown as CanonicalValue },
      range: element.range,
    }, ...assembled.records],
    components: [{
      id,
      fragment: fragment.id,
      inputs: {
        draft: { kind: "record" as const, id: draftId },
        [exactModelTextInputName("prompt")]: promptSource.ref,
        ...assembled.inputs,
      },
      outputs: { video: `${id}.video` },
      range: element.range,
    }],
    fragments: [fragment],
  };
}

const COMMON_OPTIONAL = ["resolution", "aspect-ratio", "generate-audio"] as const;

export const decodeSeedanceTextVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "model", "prompt", "duration"], [...COMMON_OPTIONAL, "web-search"]);
  empty(element);
  const selected = modelSelection(element);
  const promptSource = resolved(element, "prompt", resolveReference);
  prompt(promptSource, `${element.name}.prompt`);
  return generationOutput({ element, ...selected, promptSource, media: [], resolveReference });
};

export const decodeSeedanceFrameVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "model", "prompt", "duration", "first-frame"], [...COMMON_OPTIONAL, "last-frame"]);
  empty(element);
  const selected = modelSelection(element);
  const promptSource = resolved(element, "prompt", resolveReference);
  prompt(promptSource, `${element.name}.prompt`);
  return generationOutput({
    element, ...selected, promptSource, media: frameInputs(element, resolveReference), resolveReference,
  });
};

export const decodeSeedanceReferenceVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "model", "prompt", "duration"], COMMON_OPTIONAL);
  const selected = modelSelection(element);
  const promptSource = resolved(element, "prompt", resolveReference);
  prompt(promptSource, `${element.name}.prompt`);
  return generationOutput({
    element,
    ...selected,
    promptSource,
    media: referenceInputs(element, selected.model, resolveReference),
    resolveReference,
  });
};

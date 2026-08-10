import { speechTypes } from "@narratage/speech";
import { artifactTypes } from "@narratage/artifact";
import type { CanonicalValue } from "@narratage/protocol";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@narratage/markup";

import {
  createSeedanceAssembledGenerationFragment,
  createSeedanceSpeechGenerationFragment,
} from "./fragment.js";
import {
  generationPort,
  sealGenerationMediaBinding,
  sealGenerationRequestDraft,
} from "@narratage/generation";
import type { GenerationMediaPort, GenerationMediaRole, GenerationPortTable } from "@narratage/generation";
import { exactModelMediaInputNames, exactModelTextInputName } from "@narratage/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput } from "@narratage/model-kit";
import { textTypes, verifyText } from "@narratage/text";

import {
  sealSeedanceSpeechProgram,
  seedanceEndpoints,
  seedancePorts,
  seedanceSpeechCompileProducers,
  seedanceTypes,
} from "./index.js";
import type {
  SeedanceModel,
  SeedancePortMap,
} from "./index.js";

type ReferenceInput = {
  readonly role: GenerationMediaRole;
  readonly source: SurfaceResolvedReference;
};

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
  const value: MarkupAttributeValue | undefined = element.attributes[name];
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

function prompt(reference: SurfaceResolvedReference, subject: string): void {
  if (!sameType(reference.type, textTypes.text)) throw new Error(`${subject} must reference Text`);
  const value = reference.record?.value;
  if (value !== undefined) {
    if (value.kind !== "inline") throw new Error(`${subject} has an invalid authored Text value`);
    verifyText(value.value);
  }
}

function mediaReference(reference: SurfaceResolvedReference, role: GenerationMediaRole, subject: string): SurfaceResolvedReference {
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

/** The model's own port table is the only source of truth for these bounds. */
function enumeratedPort(table: GenerationPortTable, name: string): readonly (string | number)[] {
  const port = generationPort(table, name);
  if (port.value.kind !== "enum") throw new Error(`${table.model} port ${name} is not enumerated`);
  return port.value.values;
}

function generationSettings(
  element: StructuredElement,
  model: SeedanceModel,
  suppliedDurationSec?: number,
): SeedancePortMap {
  const table = seedancePorts[model];
  const duration = generationPort(table, "duration");
  if (duration.value.kind !== "number") throw new Error("Seedance duration port is not numeric");
  const durationSec = suppliedDurationSec ?? integerAttribute(element, "duration");
  const { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = duration.value;
  if (durationSec < minimum || durationSec > maximum) {
    throw new Error(`${element.name}.duration must be between ${minimum} and ${maximum} seconds`);
  }
  const resolutions = enumeratedPort(table, "resolution");
  const resolution = optionalStringAttribute(element, "resolution") ?? "720p";
  if (!resolutions.includes(resolution)) {
    throw new Error(`${element.name}.resolution must be ${resolutions.join(", ")} for ${model}`);
  }
  const aspectRatios = enumeratedPort(table, "aspectRatio");
  const aspectRatio = optionalStringAttribute(element, "aspect-ratio") ?? "9:16";
  if (!aspectRatios.includes(aspectRatio)) {
    throw new Error(`${element.name}.aspect-ratio is not supported by Seedance`);
  }
  return {
    duration: [durationSec],
    resolution: [resolution],
    aspectRatio: [aspectRatio],
    webSearch: [booleanAttribute(element, "web-search", false)],
  };
}

const REFERENCE_PORTS = {
  image: "referenceImage",
  video: "referenceVideo",
  audio: "referenceAudio",
} as const satisfies Record<GenerationMediaRole, string>;

function references(
  element: StructuredElement,
  model: SeedanceModel,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): ReferenceInput[] {
  const table = seedancePorts[model];
  const accepted = Object.keys(REFERENCE_PORTS) as readonly GenerationMediaRole[];
  const result: ReferenceInput[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Reference children`);
      continue;
    }
    if (localName(child.name) !== "Reference") throw new Error(`${element.name} accepts only Reference children`);
    attributes(child, [], accepted);
    const kinds = accepted.filter((kind) => child.attributes[kind] !== undefined);
    if (kinds.length !== 1) throw new Error(`${child.name} requires exactly one of ${accepted.join(", ")}`);
    const role = kinds[0]!;
    const source = mediaReference(resolved(child, role, resolveReference), role, `${child.name}.${role}`);
    result.push({ role, source });
  }
  // Every bound below is read from the model's own port table, never repeated here.
  for (const role of accepted) {
    const port = generationPort(table, REFERENCE_PORTS[role]);
    const used = result.filter((item) => item.role === role).length;
    if (used > port.maxItems) {
      throw new Error(`${element.name} accepts at most ${port.maxItems} ${role} references`);
    }
  }
  return result;
}

type AssembledReferences = {
  readonly mediaInputs: readonly ExactModelMediaInput[];
  readonly records: readonly {
    readonly id: string;
    readonly type: SurfaceResolvedReference["type"];
    readonly value: { readonly kind: "inline"; readonly value: CanonicalValue };
    readonly range: StructuredElement["range"];
  }[];
  readonly inputs: Readonly<Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }>>;
};

function assembleReferences(
  id: string,
  endpoint: ExactModelEndpoint,
  values: readonly ReferenceInput[],
  range: StructuredElement["range"],
): AssembledReferences {
  const records: AssembledReferences["records"][number][] = [];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {};
  const mediaInputs = values.map((value, index): ExactModelMediaInput => {
    const name = `media-${String(index + 1).padStart(4, "0")}`;
    const portName = REFERENCE_PORTS[value.role];
    const binding = endpoint.mediaBindings[portName];
    if (binding === undefined) throw new Error(`${endpoint.ports.model} has no media port ${portName}`);
    const port = generationPort(endpoint.ports, portName);
    if (port.value.kind !== "media") throw new Error(`${endpoint.ports.model} port ${portName} is not media`);
    const mediaPort = port as GenerationMediaPort;
    const bindingId = `${id}.${name}.binding`;
    records.push({
      id: bindingId,
      type: binding.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(mediaPort, { role: value.role }) as unknown as CanonicalValue,
      },
      range,
    });
    const names = exactModelMediaInputNames(name);
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = value.source.ref;
    return { name, port: portName };
  });
  return { mediaInputs, records, inputs };
}

function speechDurationReference(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference | undefined {
  if (typeof element.attributes.duration === "string") return undefined;
  const result = resolved(element, "duration", resolveReference);
  if (!sameType(result.type, speechTypes.duration)) {
    throw new Error(`${element.name}.duration must reference a SpeechDuration`);
  }
  return result;
}

function generationOutput(
  element: StructuredElement,
  endpoint: ExactModelEndpoint,
  draft: ReturnType<typeof sealGenerationRequestDraft>,
  promptSource: SurfaceResolvedReference,
  references: readonly ReferenceInput[],
  output: string,
) {
  const id = stringAttribute(element, "id");
  const assembled = assembleReferences(id, endpoint, references, element.range);
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
      outputs: { video: output },
      range: element.range,
    }],
    fragments: [fragment],
  };
}

export const decodeSeedanceVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "model", "prompt", "duration"], [
    "resolution", "aspect-ratio", "generate-audio", "web-search",
  ]);
  const selected = modelSelection(element);
  const promptSource = resolved(element, "prompt", resolveReference);
  prompt(promptSource, `${element.name}.prompt`);
  const refs = references(element, selected.model, resolveReference);
  const draft = sealGenerationRequestDraft(seedancePorts[selected.model], {
    ...generationSettings(element, selected.model),
    generateAudio: [booleanAttribute(element, "generate-audio", false)],
  });
  return generationOutput(element, selected.endpoint, draft, promptSource, refs, `${stringAttribute(element, "id")}.video`);
};

export const decodeSeedanceSpeechSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "model", "prompt", "duration"], [
    "resolution", "aspect-ratio", "web-search",
  ]);
  const selected = modelSelection(element);
  const promptSource = resolved(element, "prompt", resolveReference);
  prompt(promptSource, `${element.name}.prompt`);
  const refs = references(element, selected.model, resolveReference);
  const duration = speechDurationReference(element, resolveReference);
  if (duration !== undefined) {
    const { duration: _later, ...settings } = generationSettings(element, selected.model, 4);
    const program = sealSeedanceSpeechProgram({
      contract: "svml.seedance-speech-spine@1",
      model: selected.model,
      ports: {
        ...settings,
        generateAudio: [true],
      },
    });
    const id = stringAttribute(element, "id");
    const programId = `${id}.program`;
    const assembled = assembleReferences(id, selected.endpoint, refs, element.range);
    const fragment = createSeedanceSpeechGenerationFragment(
      selected.endpoint,
      seedanceSpeechCompileProducers[selected.model],
      assembled.mediaInputs,
      [{ name: "prompt", port: "prompt" }],
    );
    return {
      records: [{
        id: programId,
        type: seedanceTypes.speechSpine,
        value: { kind: "inline", value: program as unknown as CanonicalValue },
        range: element.range,
      }, ...assembled.records],
      components: [{
        id,
        fragment: fragment.id,
        inputs: {
          program: { kind: "record", id: programId },
          duration: duration.ref,
          [exactModelTextInputName("prompt")]: promptSource.ref,
          ...assembled.inputs,
        },
        outputs: { video: id },
        range: element.range,
      }],
      fragments: [fragment],
    };
  }
  const draft = sealGenerationRequestDraft(seedancePorts[selected.model], {
    ...generationSettings(element, selected.model),
    generateAudio: [true],
  });
  return generationOutput(element, selected.endpoint, draft, promptSource, refs, stringAttribute(element, "id"));
};

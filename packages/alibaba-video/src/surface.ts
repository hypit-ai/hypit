/**
 * Alibaba Video Generation Surface Decoders
 * Decodes markup surfaces into generation fragments using the current
 * Distribution StructuredSurfaceHandler contract (same as @hypit/seedance).
 */

import { artifactTypes } from "@hypit/artifact";
import {
  generationPort,
  sealGenerationMediaBinding,
  sealGenerationRequestDraft,
} from "@hypit/generation";
import type { GenerationMediaPort, GenerationMediaRole, GenerationPortTable } from "@hypit/generation";
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

import { createAlibabaVideoAssembledGenerationFragment } from "./fragment.js";
import { alibabaVideoEndpoints, alibabaVideoPorts } from "./index.js";
import type { AlibabaVideoModel, AlibabaVideoPortMap } from "./index.js";

type MediaInput = {
  readonly port: "referenceImage";
  readonly role: GenerationMediaRole;
  readonly source: SurfaceResolvedReference;
};

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

function sameType(
  left: SurfaceResolvedReference["type"],
  right: SurfaceResolvedReference["type"],
): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
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

function enumeratedPort(table: GenerationPortTable, name: string): readonly (string | number)[] {
  const port = generationPort(table, name);
  if (port.value.kind !== "enum") throw new Error(`alibaba-qwen-vvg port ${name} is not enumerated`);
  return port.value.values;
}

function generationSettings(element: StructuredElement, model: AlibabaVideoModel): AlibabaVideoPortMap {
  const table = alibabaVideoPorts[model];
  const durationSec = Number(optionalStringAttribute(element, "duration") ?? "5");
  if (!Number.isSafeInteger(durationSec)) throw new Error(`${element.name}.duration must be an integer`);
  const resolutions = enumeratedPort(table, "resolution");
  const resolution = optionalStringAttribute(element, "resolution") ?? "720p";
  if (!resolutions.includes(resolution)) {
    throw new Error(`${element.name}.resolution must be ${resolutions.join(", ")}`);
  }
  const aspectRatios = enumeratedPort(table, "aspectRatio");
  const aspectRatio = optionalStringAttribute(element, "aspect-ratio") ?? "16:9";
  if (!aspectRatios.includes(aspectRatio)) {
    throw new Error(`${element.name}.aspect-ratio must be ${aspectRatios.join(", ")}`);
  }
  return {
    duration: [durationSec],
    resolution: [resolution],
    aspectRatio: [aspectRatio],
  } as AlibabaVideoPortMap;
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
  readonly model: AlibabaVideoModel;
  readonly promptSource: SurfaceResolvedReference;
  readonly media: readonly MediaInput[];
  readonly resolveReference: (path: string) => SurfaceResolvedReference | undefined;
}) {
  const { element, endpoint, model, promptSource } = args;
  const id = stringAttribute(element, "id");
  const assembled = args.media.length > 0
    ? assembleMedia(id, endpoint, args.media, element.range)
    : { mediaInputs: [] as ExactModelMediaInput[], records: [], inputs: {} };
  const draft = sealGenerationRequestDraft(alibabaVideoPorts[model], generationSettings(element, model));
  const fragment = createAlibabaVideoAssembledGenerationFragment(
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

function modelSelection(element: StructuredElement): { endpoint: ExactModelEndpoint; model: AlibabaVideoModel } {
  const requested = stringAttribute(element, "model");
  if (requested === "qwen-vvg" || requested === "alibaba-qwen-vvg") {
    const endpoint = alibabaVideoEndpoints["qwen-vvg"];
    if (!endpoint) throw new Error(`${element.name}.model qwen-vvg endpoint is not defined`);
    return { endpoint, model: "alibaba-qwen-vvg" };
  }
  throw new Error(`${element.name}.model must be qwen-vvg or alibaba-qwen-vvg`);
}

export const decodeAlibabaVideoTextVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const selected = modelSelection(element);
  const promptSource = resolved(element, "prompt", resolveReference);
  prompt(promptSource, `${element.name}.prompt`);
  return generationOutput({ element, ...selected, promptSource, media: [], resolveReference });
};

export const decodeAlibabaVideoReferenceVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const selected = modelSelection(element);
  const promptSource = resolved(element, "prompt", resolveReference);
  prompt(promptSource, `${element.name}.prompt`);
  const media: MediaInput[] = [];
  if (element.attributes["reference-image"] !== undefined) {
    media.push({
      port: "referenceImage",
      role: "image",
      source: mediaReference(resolved(element, "reference-image", resolveReference), "image", `${element.name}.reference-image`),
    });
  }
  return generationOutput({ element, ...selected, promptSource, media, resolveReference });
};

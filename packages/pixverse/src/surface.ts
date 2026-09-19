import { artifactTypes } from "@hypit/artifact";
import { generationPort, sealGenerationMediaBinding, sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationMediaPort, GenerationMediaRole, GenerationPortValue } from "@hypit/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
  exactModelTextInputName,
} from "@hypit/model-kit";
import type { ExactModelEndpoint } from "@hypit/model-kit";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import { textTypes, verifyText } from "@hypit/text";

import { pixverseEndpointsByModel } from "./index.js";
import type { PixverseModel } from "./index.js";

type MediaInput = {
  readonly port: "firstFrame" | "lastFrame" | "referenceImage" | "referenceVideo";
  readonly role: GenerationMediaRole;
  readonly source: SurfaceResolvedReference;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localName(name: string): string {
  return name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
}

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.name === right.name && left.module.name === right.module.name && left.module.version === right.module.version;
}

function exact(element: StructuredElement, allowed: readonly string[], required: readonly string[]): void {
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.includes(name));
  assert(unknown.length === 0, `${element.name} does not accept ${unknown[0]}`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  assert(missing.length === 0, `${element.name} requires ${missing.join(", ")}`);
}

function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  assert(typeof value === "string" && value.trim().length > 0, `${element.name}.${name} must be text`);
  return value.trim();
}

/** An absent optional attribute leaves its port unstated, which the model reads as its own default. */
function optionalText(element: StructuredElement, name: string): readonly GenerationPortValue[] | undefined {
  return element.attributes[name] === undefined ? undefined : [text(element, name)];
}

function optionalFlag(element: StructuredElement, name: string): readonly GenerationPortValue[] | undefined {
  if (element.attributes[name] === undefined) return undefined;
  const value = text(element, name);
  assert(value === "true" || value === "false", `${element.name}.${name} must be true or false`);
  return [value === "true"];
}

function integer(element: StructuredElement, name: string): readonly GenerationPortValue[] {
  const value = text(element, name);
  assert(/^\d+$/u.test(value), `${element.name}.${name} must be a whole number`);
  return [Number(value)];
}

function optionalInteger(element: StructuredElement, name: string): readonly GenerationPortValue[] | undefined {
  return element.attributes[name] === undefined ? undefined : integer(element, name);
}

function ref(
  element: StructuredElement,
  name: string,
  type: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const value: MarkupAttributeValue | undefined = element.attributes[name];
  assert(typeof value === "object" && value.kind === "reference", `${element.name}.${name} must be a reference`);
  const result = resolve(value.path);
  assert(result !== undefined && sameType(result.type, type), `${element.name}.${name} has the wrong type`);
  return result;
}

function media(
  element: StructuredElement,
  name: string,
  role: GenerationMediaRole,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const artifact = ref(element, name, artifactTypes.blob, resolve);
  if (artifact.record !== undefined) {
    assert(artifact.record.value.kind === "blob" && artifact.record.value.mediaType.startsWith(`${role}/`),
      `${element.name}.${name} must reference ${role} media`);
  }
  return artifact;
}

function empty(element: StructuredElement): void {
  assert(!element.children.some((item) => item.kind === "element" || item.value.trim()),
    `${element.name} accepts no children`);
}

function selectModel(element: StructuredElement): { endpoint: ExactModelEndpoint; model: PixverseModel } {
  const requested = text(element, "model");
  if (requested === "v6" || requested === "pixverse-v6") {
    return { endpoint: pixverseEndpointsByModel["pixverse-v6"], model: "pixverse-v6" };
  }
  if (requested === "c1" || requested === "pixverse-c1") {
    return { endpoint: pixverseEndpointsByModel["pixverse-c1"], model: "pixverse-c1" };
  }
  throw new Error(`${element.name}.model must be v6 or c1`);
}

/** A switch one model carries and the other does not is refused where it was authored. */
function modelScoped(
  element: StructuredElement,
  endpoint: ExactModelEndpoint,
  attribute: string,
  port: string,
  read: (element: StructuredElement, name: string) => readonly GenerationPortValue[] | undefined,
): readonly GenerationPortValue[] | undefined {
  if (element.attributes[attribute] === undefined) return undefined;
  assert(endpoint.ports.ports.some((item) => item.name === port),
    `${element.name}.${attribute} is not accepted by ${endpoint.ports.model}`);
  return read(element, attribute);
}

function capacity(element: StructuredElement, endpoint: ExactModelEndpoint, port: string, used: number): void {
  if (used === 0) return;
  const declared = endpoint.ports.ports.find((item) => item.name === port);
  assert(declared !== undefined, `${element.name} references are not accepted by ${endpoint.ports.model}`);
  assert(used <= declared.maxItems,
    `${element.name} accepts at most ${declared.maxItems} ${port === "referenceVideo" ? "video" : "image"} references on ${endpoint.ports.model}`);
}

function assemble(
  element: StructuredElement,
  endpoint: ExactModelEndpoint,
  prompt: SurfaceResolvedReference,
  inputs: readonly MediaInput[],
  stated: Readonly<Record<string, readonly GenerationPortValue[] | undefined>>,
) {
  const id = text(element, "id");
  const draft = sealGenerationRequestDraft(endpoint.ports, Object.fromEntries(
    Object.entries(stated).filter((entry): entry is [string, readonly GenerationPortValue[]] => entry[1] !== undefined),
  ));
  const records: Array<{ id: string; type: TypeRef; value: { kind: "inline"; value: CanonicalValue }; range: StructuredElement["range"] }> = [{
    id: `${id}.draft`, type: endpoint.draftType,
    value: { kind: "inline", value: draft as unknown as CanonicalValue }, range: element.range,
  }];
  const componentInputs: Record<string, SurfaceResolvedReference["ref"] | { kind: "record"; id: string }> = {
    draft: { kind: "record", id: `${id}.draft` }, [exactModelTextInputName("prompt")]: prompt.ref,
  };
  const attached = inputs.map(({ port, role, source }, index) => {
    const name = `media-${String(index + 1).padStart(4, "0")}`;
    const bindingId = `${id}.${name}.binding`;
    const mediaPort = generationPort(endpoint.ports, port);
    assert(mediaPort.value.kind === "media", `PixVerse port ${port} is not media`);
    records.push({
      id: bindingId, type: endpoint.mediaBindings[port]!.type,
      value: { kind: "inline", value: sealGenerationMediaBinding(mediaPort as GenerationMediaPort, { role }) as unknown as CanonicalValue },
      range: element.range,
    });
    const names = exactModelMediaInputNames(name);
    componentInputs[names.binding] = { kind: "record", id: bindingId };
    componentInputs[names.artifact] = source.ref;
    return { name, port } as const;
  });
  const fragment = createExactModelPrimaryGenerationFragment(endpoint, attached, [{ name: "prompt", port: "prompt" }]);
  return { records, fragments: [fragment], components: [{
    id, fragment: fragment.id, inputs: componentInputs, outputs: { video: `${id}.video` }, range: element.range,
  }] };
}

function promptReference(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  const prompt = ref(element, "prompt", textTypes.text, resolveReference);
  if (prompt.record !== undefined) {
    assert(prompt.record.value.kind === "inline", `${element.name}.prompt must reference Text`);
    verifyText(prompt.record.value.value);
  }
  return prompt;
}

const VIDEO_ATTRIBUTES = ["id", "model", "prompt", "first-frame", "last-frame", "duration", "quality",
  "aspect-ratio", "generate-audio", "multi-clip", "seed"] as const;

export const decodePixverseVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, VIDEO_ATTRIBUTES, ["id", "model", "prompt", "duration", "quality"]);
  empty(element);
  const { endpoint } = selectModel(element);
  const frames = ([["firstFrame", "first-frame"], ["lastFrame", "last-frame"]] as const)
    .filter(([, attribute]) => element.attributes[attribute] !== undefined)
    .map(([port, attribute]) => ({
      port, role: "image" as const, source: media(element, attribute, "image", resolveReference),
    }));
  return assemble(element, endpoint, promptReference(element, resolveReference), frames, {
    duration: integer(element, "duration"),
    quality: [text(element, "quality")],
    aspectRatio: optionalText(element, "aspect-ratio"),
    generateAudio: optionalFlag(element, "generate-audio"),
    multiClip: modelScoped(element, endpoint, "multi-clip", "multiClip", optionalFlag),
    seed: modelScoped(element, endpoint, "seed", "seed", optionalInteger),
  });
};

const REFERENCE_ATTRIBUTES = ["id", "model", "prompt", "duration", "quality",
  "aspect-ratio", "generate-audio", "seed"] as const;

export const decodePixverseReferenceVideoSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, REFERENCE_ATTRIBUTES, ["id", "model", "prompt", "quality"]);
  const { endpoint } = selectModel(element);
  const references: MediaInput[] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      assert(child.value.trim().length === 0, `${element.name} accepts only Reference children`);
      continue;
    }
    assert(localName(child.name) === "Reference", `${element.name} accepts only Reference children`);
    empty(child);
    const roles = (["image", "video"] as const).filter((role) => child.attributes[role] !== undefined);
    exact(child, ["image", "video"], []);
    assert(roles.length === 1, `${child.name} requires exactly one of image, video`);
    const role = roles[0]!;
    references.push({
      port: role === "image" ? "referenceImage" : "referenceVideo",
      role,
      source: media(child, role, role, resolveReference),
    });
  }
  assert(references.length > 0, `${element.name} requires at least one Reference`);
  for (const port of ["referenceImage", "referenceVideo"] as const) {
    capacity(element, endpoint, port, references.filter((item) => item.port === port).length);
  }
  const videos = references.some((item) => item.port === "referenceVideo");
  if (videos) {
    assert(element.attributes["duration"] === undefined,
      `${element.name} takes no duration; its video references carry the length of the run`);
  } else {
    assert(element.attributes["duration"] !== undefined, `${element.name} requires duration`);
  }
  return assemble(element, endpoint, promptReference(element, resolveReference), references, {
    duration: optionalInteger(element, "duration"),
    quality: [text(element, "quality")],
    aspectRatio: optionalText(element, "aspect-ratio"),
    generateAudio: optionalFlag(element, "generate-audio"),
    seed: modelScoped(element, endpoint, "seed", "seed", optionalInteger),
  });
};

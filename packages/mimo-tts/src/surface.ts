import { artifactTypes } from "@narratage/artifact";
import {
  generationPort,
  sealGenerationMediaBinding,
} from "@narratage/generation";
import type { GenerationMediaPort, GenerationPortValue } from "@narratage/generation";
import { exactModelMediaInputNames } from "@narratage/model-kit";
import type { ExactModelMediaInput } from "@narratage/model-kit";
import { narrativeTypes } from "@narratage/narrative";
import type { CanonicalValue } from "@narratage/protocol";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  TextAttributeValue,
} from "@narratage/text";

import { createMimoTtsAudioFragment } from "./fragment.js";
import {
  mimoPresetVoices,
  mimoTtsEndpoints,
  sealMimoTtsRequestDraft,
} from "./index.js";
import type { MimoPresetVoice, MimoTtsModel } from "./index.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function attributes(element: StructuredElement, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.has(name));
  if (unknown.length > 0 || required.some((name) => element.attributes[name] === undefined)) {
    throw new Error(`${element.name} requires ${required.join(", ")}`
      + (optional.length === 0 ? "" : `; optional: ${optional.join(", ")}`));
  }
}

function stringAttribute(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${element.name}.${name} must be a non-empty string`);
  }
  return value.trim();
}

function referencePath(element: StructuredElement, name: string): string {
  const value: TextAttributeValue | undefined = element.attributes[name];
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

function inline(reference: SurfaceResolvedReference, subject: string): CanonicalValue {
  if (reference.record?.value.kind !== "inline") throw new Error(`${subject} must reference an authored inline value`);
  return reference.record.value.value;
}

function speechText(reference: SurfaceResolvedReference, subject: string): string {
  if (!sameType(reference.type, narrativeTypes.speechExcerpt)) {
    throw new Error(`${subject} must reference a NarrativeSpeechExcerpt`);
  }
  const value = inline(reference, subject) as unknown as Record<string, unknown>;
  if (value.contract !== "svml.narrative-speech-excerpt@1" || typeof value.speech !== "string"
    || value.speech.trim().length === 0) {
    throw new Error(`${subject} NarrativeSpeechExcerpt is invalid`);
  }
  return value.speech;
}

function sample(reference: SurfaceResolvedReference, subject: string): SurfaceResolvedReference {
  if (!sameType(reference.type, artifactTypes.blob)) {
    throw new Error(`${subject} must reference an audio BlobArtifact`);
  }
  const value = reference.record?.value;
  if (value !== undefined && (value.kind !== "blob" || !value.mediaType.startsWith("audio/"))) {
    throw new Error(`${subject} must be audio media`);
  }
  return reference;
}

function body(element: StructuredElement, required: boolean): string | undefined {
  if (element.children.some((child) => child.kind === "element")) {
    throw new Error(`${element.name} accepts instruction text only`);
  }
  const lines = element.children.map((child) => child.kind === "text" ? child.value : "").join("")
    .replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  const value = lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim();
  if (value.length === 0) {
    if (required) throw new Error(`${element.name} requires a voice description in its body`);
    return undefined;
  }
  return value;
}

function output(
  element: StructuredElement,
  endpoint: (typeof mimoTtsEndpoints)[keyof typeof mimoTtsEndpoints],
  draft: ReturnType<typeof sealMimoTtsRequestDraft>,
  media: readonly { readonly input: ExactModelMediaInput; readonly source: SurfaceResolvedReference }[] = [],
) {
  const id = stringAttribute(element, "id");
  const draftId = `${id}.draft`;
  const records: Array<{
    readonly id: string;
    readonly type: SurfaceResolvedReference["type"];
    readonly value: { readonly kind: "inline"; readonly value: CanonicalValue };
    readonly range: StructuredElement["range"];
  }> = [{
    id: draftId,
    type: endpoint.draftType,
    value: { kind: "inline", value: draft as unknown as CanonicalValue },
    range: element.range,
  }];
  const inputs: Record<string, SurfaceResolvedReference["ref"] | { readonly kind: "record"; readonly id: string }> = {
    draft: { kind: "record", id: draftId },
  };
  for (const item of media) {
    const binding = endpoint.mediaBindings[item.input.port];
    if (binding === undefined) throw new Error(`${endpoint.ports.model} has no media port ${item.input.port}`);
    const port = generationPort(endpoint.ports, item.input.port);
    if (port.value.kind !== "media") throw new Error(`${endpoint.ports.model} port ${item.input.port} is not media`);
    const names = exactModelMediaInputNames(item.input.name);
    const bindingId = `${id}.${item.input.name}.binding`;
    records.push({
      id: bindingId,
      type: binding.type,
      value: {
        kind: "inline",
        value: sealGenerationMediaBinding(port as GenerationMediaPort, { role: "audio" }) as unknown as CanonicalValue,
      },
      range: element.range,
    });
    inputs[names.binding] = { kind: "record", id: bindingId };
    inputs[names.artifact] = item.source.ref;
  }
  const fragment = createMimoTtsAudioFragment(endpoint, media.map((item) => item.input));
  return {
    records,
    components: [{
      id,
      fragment: fragment.id,
      inputs,
      outputs: { audio: `${id}.audio` },
      range: element.range,
    }],
    fragments: [fragment],
  };
}

function common(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
): readonly GenerationPortValue[] {
  return [speechText(resolved(element, "speech", resolveReference), `${element.name}.speech`)];
}

export const decodeMimoPresetSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "speech", "voice"]);
  const voice = stringAttribute(element, "voice") as MimoPresetVoice;
  if (!mimoPresetVoices.includes(voice)) throw new Error(`${element.name}.voice is not a MiMo preset voice`);
  const instruction = body(element, false);
  const ports: Record<string, readonly GenerationPortValue[]> = { text: common(element, resolveReference), voice: [voice] };
  if (instruction !== undefined) ports.instruction = [instruction];
  return output(element, mimoTtsEndpoints.preset, sealMimoTtsRequestDraft("mimo-v2.5-tts", ports));
};

export const decodeMimoVoiceDesignSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "speech"]);
  return output(element, mimoTtsEndpoints.voiceDesign, sealMimoTtsRequestDraft("mimo-v2.5-tts-voicedesign", {
    text: common(element, resolveReference),
    voiceDescription: [body(element, true)!],
  }));
};

export const decodeMimoVoiceCloneSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "speech", "sample"]);
  const instruction = body(element, false);
  const source = sample(resolved(element, "sample", resolveReference), `${element.name}.sample`);
  const ports: Record<string, readonly GenerationPortValue[]> = {
    text: common(element, resolveReference),
  };
  if (instruction !== undefined) ports.instruction = [instruction];
  return output(
    element,
    mimoTtsEndpoints.voiceClone,
    sealMimoTtsRequestDraft("mimo-v2.5-tts-voiceclone", ports),
    [{ input: { name: "sample", port: "sample" }, source }],
  );
};

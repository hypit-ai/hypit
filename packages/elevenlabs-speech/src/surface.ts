import { artifactTypes } from "@hypit/artifact";
import { generationPort, sealGenerationMediaBinding } from "@hypit/generation";
import type { GenerationMediaPort } from "@hypit/generation";
import { exactModelMediaInputNames, exactModelTextInputName } from "@hypit/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput, ExactModelTextInput } from "@hypit/model-kit";
import type { CanonicalValue } from "@hypit/protocol";
import { textTypes, verifyText } from "@hypit/text";
import type {
  MarkupAttributeValue,
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
} from "@hypit/markup";

import { createElevenLabsSpeechAudioFragment } from "./fragment.js";
import { elevenLabsSpeechEndpoints, sealElevenLabsSpeechRequestDraft } from "./index.js";

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}

function attributes(element: StructuredElement, required: readonly string[]): void {
  const allowed = new Set(required);
  const unknown = Object.keys(element.attributes).filter((name) => !allowed.has(name));
  if (unknown.length > 0 || required.some((name) => element.attributes[name] === undefined)) {
    throw new Error(`${element.name} requires ${required.join(", ")}`);
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

function speechText(reference: SurfaceResolvedReference, subject: string): SurfaceResolvedReference {
  if (!sameType(reference.type, textTypes.text)) throw new Error(`${subject} must reference Text`);
  const value = reference.record?.value;
  if (value !== undefined) {
    if (value.kind !== "inline") throw new Error(`${subject} has an invalid authored Text value`);
    verifyText(value.value);
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
  endpoint: ExactModelEndpoint,
  draft: ReturnType<typeof sealElevenLabsSpeechRequestDraft>,
  outputName: "reference" | "audio",
  text: readonly { readonly input: ExactModelTextInput; readonly source: SurfaceResolvedReference }[],
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
  for (const item of text) inputs[exactModelTextInputName(item.input.name)] = item.source.ref;
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
  const fragment = createElevenLabsSpeechAudioFragment(
    endpoint,
    media.map((item) => item.input),
    text.map((item) => item.input),
  );
  return {
    records,
    components: [{
      id,
      fragment: fragment.id,
      inputs,
      outputs: { audio: `${id}.${outputName}` },
      range: element.range,
    }],
    fragments: [fragment],
  };
}

function speechInput(
  element: StructuredElement,
  resolveReference: (path: string) => SurfaceResolvedReference | undefined,
) {
  return {
    input: { name: "speech", port: "text" },
    source: speechText(resolved(element, "speech", resolveReference), `${element.name}.speech`),
  } as const;
}

export const decodeElevenLabsVoiceDesignSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "speech"]);
  return output(
    element,
    elevenLabsSpeechEndpoints.voiceDesign,
    sealElevenLabsSpeechRequestDraft("eleven_ttv_v3", { voiceDescription: [body(element, true)!] }),
    "reference",
    [speechInput(element, resolveReference)],
  );
};


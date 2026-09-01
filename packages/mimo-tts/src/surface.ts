import type { CanonicalValue } from "@hypit/protocol";
import { exactModelTextInputName } from "@hypit/model-kit";
import type { ExactModelTextInput } from "@hypit/model-kit";
import { textTypes, verifyText } from "@hypit/text";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";

import { createMimoTtsAudioFragment } from "./fragment.js";
import { mimoTtsEndpoints, sealMimoTtsRequestDraft } from "./index.js";

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

function body(element: StructuredElement): string {
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
  if (value.length === 0) throw new Error(`${element.name} requires a voice description in its body`);
  return value;
}

export const decodeMimoVoiceDesignSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  attributes(element, ["id", "speech"]);
  const id = stringAttribute(element, "id");
  const speech = speechText(resolved(element, "speech", resolveReference), `${element.name}.speech`);
  const endpoint = mimoTtsEndpoints.voiceDesign;
  const draftId = `${id}.draft`;
  const draft = sealMimoTtsRequestDraft("mimo-v2.5-tts-voicedesign", {
    voiceDescription: [body(element)],
  });
  const textInput: ExactModelTextInput = { name: "speech", port: "text" };
  const fragment = createMimoTtsAudioFragment(endpoint, [], [textInput]);
  return {
    records: [{
      id: draftId,
      type: endpoint.draftType,
      value: { kind: "inline", value: draft as unknown as CanonicalValue },
      range: element.range,
    }],
    components: [{
      id,
      fragment: fragment.id,
      inputs: {
        draft: { kind: "record", id: draftId },
        [exactModelTextInputName(textInput.name)]: speech.ref,
      },
      outputs: { audio: `${id}.audio` },
      range: element.range,
    }],
    fragments: [fragment],
  };
};

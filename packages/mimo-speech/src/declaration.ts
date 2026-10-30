import { declarationField, type AuthorDeclaration, type AuthorDeclarationCompiler,
  type AuthorResolvedReference } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { fieldModelAuthorComponent } from "@hypit/generation/model-fields/author";

import { createMimoSpeechAudioFragment } from "./fragment.js";
import { mimoSpeechEndpoints, mimoSpeechModuleRef, sealMimoSpeechRequestDraft } from "./index.js";

function literal(declaration: AuthorDeclaration, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`MiMo Speech ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function body(declaration: AuthorDeclaration, required: boolean): string | undefined {
  const lines = (declaration.text ?? "").replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  const value = lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim();
  if (value.length === 0) {
    if (required) throw new Error(`MiMo Speech ${declaration.name} requires a voice description.`);
    return undefined;
  }
  return value;
}

async function reference(declaration: AuthorDeclaration, name: string, type: typeof textTypes.text | typeof blobTypes.blob,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`MiMo Speech ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, type)) throw new Error(`MiMo Speech ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

const commonFields = [
  { name: "id", kind: "identifier" as const, required: true, summary: "Names the speech result." },
  { name: "speech", kind: "reference" as const, required: true, accepts: [textTypes.text], summary: "Selects the exact words to speak." },
];

export const mimoVoiceDesignAuthorDeclaration: AuthorDeclarationCompiler = {
  module: mimoSpeechModuleRef,
  declaration: "voiceDesign",
  outputs: [mimoSpeechEndpoints.voiceDesign.draftType, blobTypes.blob],
  shape: { summary: "Creates a reusable voice reference from a voice description.", fields: commonFields,
    text: "The required voice description." },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.reference`, ref: { kind: "component-output", component: id, output: "audio" }, type: blobTypes.blob,
      retained: true }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const speech = await reference(declaration, "speech", textTypes.text, resolveReference);
    const endpoint = mimoSpeechEndpoints.voiceDesign;
    return fieldModelAuthorComponent({ id, range: declaration.range, endpoint,
      draft: sealMimoSpeechRequestDraft("mimo-v2.5-tts-voicedesign", { voiceDescription: [body(declaration, true)!] }),
      fragment: createMimoSpeechAudioFragment(endpoint, [], [{ name: "speech", field: "text" }]),
      outputs: { audio: `${id}.reference` }, text: [{ name: "speech", field: "text", source: speech }] });
  },
};

export const mimoVoiceCloneAuthorDeclaration: AuthorDeclarationCompiler = {
  module: mimoSpeechModuleRef,
  declaration: "voiceClone",
  outputs: [mimoSpeechEndpoints.voiceClone.draftType,
    mimoSpeechEndpoints.voiceClone.mediaBindings.voiceReference!.type, blobTypes.blob],
  shape: { summary: "Creates speech in the voice carried by an audio reference.", fields: [
    ...commonFields,
    { name: "voice", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the voice reference audio." },
  ], text: "An optional delivery instruction." },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.audio`, ref: { kind: "component-output", component: id, output: "audio" }, type: blobTypes.blob,
      retained: true }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const speech = await reference(declaration, "speech", textTypes.text, resolveReference);
    const voice = await reference(declaration, "voice", blobTypes.blob, resolveReference);
    const instruction = body(declaration, false);
    const endpoint = mimoSpeechEndpoints.voiceClone;
    return fieldModelAuthorComponent({ id, range: declaration.range, endpoint,
      draft: sealMimoSpeechRequestDraft("mimo-v2.5-tts-voiceclone",
        instruction === undefined ? {} : { instruction: [instruction] }),
      fragment: createMimoSpeechAudioFragment(endpoint, [{ name: "voice", field: "voiceReference" }],
        [{ name: "speech", field: "text" }]),
      outputs: { audio: `${id}.audio` },
      text: [{ name: "speech", field: "text", source: speech }],
      artifacts: [{ name: "voice", field: "voiceReference", role: "audio", source: voice }] });
  },
};

export const mimoSpeechAuthorDeclarations = [mimoVoiceDesignAuthorDeclaration, mimoVoiceCloneAuthorDeclaration] as const;
export const mimoSpeechMarkupDeclarations = [{ name: "voiceDesign", tag: "VoiceDesign" },
  { name: "voiceClone", tag: "VoiceClone" }] as const;

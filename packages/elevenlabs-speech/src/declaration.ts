import { declarationField, type AuthorDeclaration, type AuthorDeclarationCompiler,
  type AuthorResolvedReference } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType } from "@hypit/hypit/protocol";
import { textTypes } from "@hypit/hypit/text";
import { fieldModelAuthorComponent } from "@hypit/generation/model-fields/author";

import { createElevenLabsSpeechAudioFragment } from "./fragment.js";
import { elevenLabsSpeechEndpoints, elevenLabsSpeechModuleRef,
  sealElevenLabsSpeechRequestDraft } from "./index.js";

function literal(declaration: AuthorDeclaration, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`ElevenLabs VoiceDesign.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function body(declaration: AuthorDeclaration): string {
  const lines = (declaration.text ?? "").replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines.filter((line) => line.trim()).map((line) => /^\s*/u.exec(line)?.[0].length ?? 0);
  const indent = indents.length === 0 ? 0 : Math.min(...indents);
  const value = lines.map((line) => line.slice(indent).trimEnd()).join("\n").trim();
  if (value.length === 0) throw new Error("ElevenLabs VoiceDesign requires a voice description.");
  return value;
}

async function speech(declaration: AuthorDeclaration,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, "speech");
  if (field?.kind !== "reference") throw new Error("ElevenLabs VoiceDesign.speech must be a reference.");
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, textTypes.text)) {
    throw new Error("ElevenLabs VoiceDesign.speech must reference Text.");
  }
  return value;
}

const endpoint = elevenLabsSpeechEndpoints.voiceDesign;

export const elevenLabsVoiceDesignAuthorDeclaration: AuthorDeclarationCompiler = {
  module: elevenLabsSpeechModuleRef,
  declaration: "voiceDesign",
  outputs: [endpoint.draftType, blobTypes.blob],
  shape: {
    summary: "Creates a reusable voice reference from a voice description and sample speech.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the voice reference." },
      { name: "speech", kind: "reference", required: true, accepts: [textTypes.text],
        summary: "Selects the exact words spoken in the sample." },
    ],
    text: "The required voice description.",
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: `${id}.reference`, ref: { kind: "component-output", component: id, output: "audio" },
      type: blobTypes.blob, retained: true }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const spoken = await speech(declaration, resolveReference);
    return fieldModelAuthorComponent({
      id,
      range: declaration.range,
      endpoint,
      draft: sealElevenLabsSpeechRequestDraft("eleven_ttv_v3", { voiceDescription: [body(declaration)] }),
      fragment: createElevenLabsSpeechAudioFragment(endpoint, [], [{ name: "speech", field: "text" }]),
      outputs: { audio: `${id}.reference` },
      text: [{ name: "speech", field: "text", source: spoken }],
    });
  },
};

export const elevenLabsSpeechAuthorDeclarations = [elevenLabsVoiceDesignAuthorDeclaration] as const;
export const elevenLabsSpeechMarkupDeclarations = [{ name: "voiceDesign", tag: "VoiceDesign" }] as const;

import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/blob";
import type { AuthorDeclarationCompiler, AuthorResolvedReference } from "@hypit/author";
import { generationTypes } from "@hypit/generation";
import { sealText, textTypes } from "@hypit/text";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";

import {
  fishAudioSpeechEndpoints,
  fishAudioSpeechModels,
  sealFishAudioSpeechRequest,
} from "../src/index.js";
import { fishAudioSpeechModuleRef } from "../src/index.js";
import { fishAudioSpeechMarkupDeclarations, fishAudioVoiceCloneAuthorDeclaration,
  fishAudioVoiceDesignAuthorDeclaration } from "../src/declaration.js";

const speech = sealText("Exact authored words stay exact.");
const speechReference: AuthorResolvedReference = {
  path: "story.segment.opening.speech",
  ref: { kind: "record", id: "story.segment.opening.speech" },
  type: textTypes.text,
  record: {
    id: "story.segment.opening.speech",
    type: textTypes.text,
    value: (speech),
  },
};
const voiceReference: AuthorResolvedReference = {
  path: "host.reference",
  ref: { kind: "record", id: "host.reference" },
  type: blobTypes.blob,
  record: {
    id: "host.reference",
    type: blobTypes.blob,
    value: { kind: "blob", resource: "res_voice-reference", size: 4, mediaType: "audio/wav" },
  },
};

async function decode(source: string, compiler: AuthorDeclarationCompiler,
  voice: AuthorResolvedReference = voiceReference) {
  return await compileMarkupDeclaration({ source, module: fishAudioSpeechModuleRef, alias: "fish",
    compilers: [compiler], syntax: fishAudioSpeechMarkupDeclarations,
    references: new Map([[speechReference.path, speechReference], [voice.path, voice]]) });
}

test("Fish Audio Speech declares the two exact audio request shapes", () => {
  assert.deepEqual(fishAudioSpeechModels, ["voice-design-1", "voice-clone"]);
  assert.ok(Object.values(fishAudioSpeechEndpoints).every((endpoint) => endpoint.returns.name === generationTypes.audioSet.name));
  assert.throws(() => sealFishAudioSpeechRequest("voice-design-1", {
    text: ["Do not rewrite me."],
  }), /voiceDescription is required/u);
  assert.throws(() => sealFishAudioSpeechRequest("voice-clone", {
    text: ["Do not rewrite me."],
  }), /voiceReference is required/u);
});

test("VoiceDesign publishes one reusable voice reference", async () => {
  const result = await decode(`<fish:VoiceDesign id="host" speech={story.segment.opening.speech}>
    A clear, confident young woman with a grounded conversational tone.
  </fish:VoiceDesign>`, fishAudioVoiceDesignAuthorDeclaration);
  assert.deepEqual(result.components[0]!.outputs, { audio: "host.reference" });
  const exported = result.components[0]!.fragment.exports.find((item) => item.name === "audio");
  assert.deepEqual(exported?.type, blobTypes.blob);
  assert.deepEqual(result.components[0]!.inputs["speech:text"], {
    kind: "record",
    id: "story.segment.opening.speech",
  });
  const request = result.records[0]!.value as Record<string, unknown>;
  assert.equal((request.fields as Record<string, unknown[]>).text, undefined);
});

test("VoiceClone binds an accepted audio Resource and publishes independent speech", async () => {
  const result = await decode(
    `<fish:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}/>`, fishAudioVoiceCloneAuthorDeclaration);
  assert.deepEqual(result.components[0]!.outputs, { audio: "narration.audio" });
  assert.deepEqual(result.components[0]!.inputs["voice:artifact"], { kind: "record", id: "host.reference" });
  assert.ok(result.components[0]!.inputs["voice:binding"] !== undefined);
});

test("VoiceClone rejects a delivery body rather than silently losing it during synthesis", async () => {
  await assert.rejects(async () => await decode(
    `<fish:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}>Calm and restrained.</fish:VoiceClone>`,
    fishAudioVoiceCloneAuthorDeclaration), /does not accept text/u);
});

test("VoiceClone refuses a known non-audio Resource", async () => {
  const image: AuthorResolvedReference = {
    ...voiceReference,
    record: {
      ...voiceReference.record!,
      value: { kind: "blob", resource: "res_image", size: 4, mediaType: "image/png" },
    },
  };
  await assert.rejects(async () => await decode(
    `<fish:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}/>` ,
    fishAudioVoiceCloneAuthorDeclaration, image), /must reference audio media/u);
});

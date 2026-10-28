import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/blob";
import type { AuthorResolvedReference } from "@hypit/author";
import { generationTypes } from "@hypit/generation";
import { sealText, textTypes } from "@hypit/text";
import { compileMarkupDeclaration } from "../../../test/compile-markup-declaration.js";

import {
  elevenLabsSpeechEndpoints,
  elevenLabsSpeechModels,
  sealElevenLabsSpeechRequest,
} from "../src/index.js";
import { elevenLabsSpeechModuleRef } from "../src/index.js";
import { elevenLabsSpeechMarkupDeclarations, elevenLabsVoiceDesignAuthorDeclaration } from "../src/declaration.js";

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

test("ElevenLabs Speech declares the exact voice design request shape", () => {
  assert.deepEqual(elevenLabsSpeechModels, ["eleven_ttv_v3"]);
  assert.equal(elevenLabsSpeechEndpoints.voiceDesign.returns.name, generationTypes.audioSet.name);
  assert.throws(() => sealElevenLabsSpeechRequest("eleven_ttv_v3", {
    text: ["Do not rewrite me."],
  }), /voiceDescription is required/u);
  assert.throws(() => sealElevenLabsSpeechRequest("eleven_ttv_v3", {
    text: ["A voice sample with enough detail to make the test intent clear."],
    voiceDescription: ["a".repeat(1001)],
  }), /voiceDescription.+1000/u);
});

test("VoiceDesign publishes one reusable voice reference", async () => {
  const result = await compileMarkupDeclaration({ source: `<eleven:VoiceDesign id="host" speech={story.segment.opening.speech}>
    A clear, confident young woman with a grounded conversational tone.
  </eleven:VoiceDesign>`, module: elevenLabsSpeechModuleRef, alias: "eleven",
    compilers: [elevenLabsVoiceDesignAuthorDeclaration], syntax: elevenLabsSpeechMarkupDeclarations,
    references: new Map([[speechReference.path, speechReference]]) });
  assert.deepEqual(result.components[0]!.outputs, { audio: "host.reference" });
  const exported = result.components[0]!.fragment.exports.find((item) => item.name === "audio");
  assert.deepEqual(exported?.type, blobTypes.blob);
  assert.deepEqual(result.components[0]!.inputs["speech:text"], {
    kind: "record",
    id: "story.segment.opening.speech",
  });
});

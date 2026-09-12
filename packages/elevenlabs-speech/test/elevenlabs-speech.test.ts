import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@hypit/artifact";
import { generationTypes } from "@hypit/generation";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { sealText, textTypes } from "@hypit/text";

import elevenLabsNodePackage from "../src/activation.js";
import {
  decodeElevenLabsVoiceDesignSurface,
  elevenLabsSpeechEndpoints,
  elevenLabsSpeechMarkupSurfaces,
  elevenLabsSpeechModels,
  sealElevenLabsSpeechRequest,
} from "../src/index.js";

function parsed(source: string) {
  return parseStructuredElement({ name: "eleven.svml", text: source }, 0).element;
}

const speech = sealText("Exact authored words stay exact.");
const speechReference: SurfaceResolvedReference = {
  path: "story.segment.opening.speech",
  ref: { kind: "record", id: "story.segment.opening.speech" },
  type: textTypes.text,
  record: {
    id: "story.segment.opening.speech",
    type: textTypes.text,
    value: { kind: "inline", value: speech },
  },
};

const context = (source: string) => ({
  sourceName: "eleven.svml",
  element: parsed(source),
  resolveReference: (path: string) => path === speechReference.path ? speechReference : undefined,
  resolveAsset: () => { throw new Error("no asset"); },
});

test("ElevenLabs Speech declares the exact voice design request shape", () => {
  assert.deepEqual(elevenLabsSpeechModels, ["eleven_ttv_v3"]);
  assert.equal(elevenLabsSpeechEndpoints.voiceDesign.returns.name, generationTypes.audioSet.name);
  assert.throws(() => sealElevenLabsSpeechRequest("eleven_ttv_v3", {
    text: ["Do not rewrite me."],
  }), /voiceDescription is required/u);
  assert.equal(elevenLabsNodePackage.format, "hypit.node-package@1");
  assert.deepEqual(elevenLabsSpeechMarkupSurfaces.map((surface) => surface.name), ["voiceDesign"]);
});

test("VoiceDesign publishes one reusable voice reference", async () => {
  const result = await decodeElevenLabsVoiceDesignSurface(context(`<eleven:VoiceDesign id="host" speech={story.segment.opening.speech}>
    A clear, confident young woman with a grounded conversational tone.
  </eleven:VoiceDesign>`));
  assert.deepEqual(result.components[0]!.outputs, { audio: "host.reference" });
  const exported = result.fragments[0]!.exports.find((item) => item.name === "audio");
  assert.deepEqual(exported?.type, artifactTypes.blob);
  assert.deepEqual(result.components[0]!.inputs["speech:text"], {
    kind: "record",
    id: "story.segment.opening.speech",
  });
});

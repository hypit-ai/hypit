import assert from "node:assert/strict";
import test from "node:test";

import { blobTypes } from "@hypit/blob";
import { generationTypes } from "@hypit/generation";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { sealText, textTypes } from "@hypit/text";

import {
  decodeFishAudioVoiceCloneSurface,
  decodeFishAudioVoiceDesignSurface,
  fishAudioSpeechEndpoints,
  fishAudioSpeechModels,
  sealFishAudioSpeechRequest,
} from "../src/index.js";

function parsed(source: string) {
  return parseStructuredElement({ name: "fish.svml", text: source }, 0).element;
}

const speech = sealText("Exact authored words stay exact.");
const speechReference: SurfaceResolvedReference = {
  path: "story.segment.opening.speech",
  ref: { kind: "record", id: "story.segment.opening.speech" },
  type: textTypes.text,
  record: {
    id: "story.segment.opening.speech",
    type: textTypes.text,
    value: (speech),
  },
};
const voiceReference: SurfaceResolvedReference = {
  path: "host.reference",
  ref: { kind: "record", id: "host.reference" },
  type: blobTypes.blob,
  record: {
    id: "host.reference",
    type: blobTypes.blob,
    value: { kind: "blob", resource: "res_voice-reference", size: 4, mediaType: "audio/wav" },
  },
};

const context = (source: string, voice: SurfaceResolvedReference = voiceReference) => ({
  sourceName: "fish.svml",
  element: parsed(source),
  resolveReference: (path: string) => path === speechReference.path
    ? speechReference : path === voice.path ? voice : undefined,
  resolveAsset: () => { throw new Error("no asset"); },
});

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
  const result = await decodeFishAudioVoiceDesignSurface(context(`<fish:VoiceDesign id="host" speech={story.segment.opening.speech}>
    A clear, confident young woman with a grounded conversational tone.
  </fish:VoiceDesign>`));
  assert.deepEqual(result.components[0]!.outputs, { audio: "host.reference" });
  const exported = result.components[0]!.fragment.exports.find((item) => item.name === "audio");
  assert.deepEqual(exported?.type, blobTypes.blob);
  assert.deepEqual(result.components[0]!.inputs["speech:text"], {
    kind: "record",
    id: "story.segment.opening.speech",
  });
  const request = result.records[0]!.value as Record<string, unknown>;
  assert.equal((request.ports as Record<string, unknown[]>).text, undefined);
});

test("VoiceClone binds an accepted audio Resource and publishes independent speech", async () => {
  const result = await decodeFishAudioVoiceCloneSurface(context(
    `<fish:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}/>`));
  assert.deepEqual(result.components[0]!.outputs, { audio: "narration.audio" });
  assert.deepEqual(result.components[0]!.inputs["voice:artifact"], { kind: "record", id: "host.reference" });
  assert.ok(result.components[0]!.inputs["voice:binding"] !== undefined);
});

test("VoiceClone rejects a delivery body rather than silently losing it during synthesis", () => {
  assert.throws(() => decodeFishAudioVoiceCloneSurface(context(
    `<fish:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}>Calm and restrained.</fish:VoiceClone>`,
  )), /no body input/u);
});

test("VoiceClone refuses a known non-audio Resource", () => {
  const image: SurfaceResolvedReference = {
    ...voiceReference,
    record: {
      ...voiceReference.record!,
      value: { kind: "blob", resource: "res_image", size: 4, mediaType: "image/png" },
    },
  };
  assert.throws(() => decodeFishAudioVoiceCloneSurface(context(
    `<fish:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}/>` ,
    image,
  )), /must reference audio media/u);
});

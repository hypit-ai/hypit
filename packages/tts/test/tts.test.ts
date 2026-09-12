import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@hypit/artifact";
import { generationTypes } from "@hypit/generation";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { sealText, textTypes } from "@hypit/text";

import mimoNodePackage from "../src/activation.js";
import {
  decodeVoiceCloneSurface,
  decodeVoiceDesignSurface,
  ttsEndpoints,
  ttsMarkupSurfaces,
  ttsModels,
  ttsPorts,
  sealTtsRequest,
} from "../src/index.js";

function parsed(source: string) {
  return parseStructuredElement({ name: "mimo.svml", text: source }, 0).element;
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
const voiceReference: SurfaceResolvedReference = {
  path: "host.reference",
  ref: { kind: "record", id: "host.reference" },
  type: artifactTypes.blob,
  record: {
    id: "host.reference",
    type: artifactTypes.blob,
    value: { kind: "blob", resource: "res_voice-reference", size: 4, mediaType: "audio/wav" },
  },
};

const context = (source: string, voice: SurfaceResolvedReference = voiceReference) => ({
  sourceName: "mimo.svml",
  element: parsed(source),
  resolveReference: (path: string) => path === speechReference.path
    ? speechReference : path === voice.path ? voice : undefined,
  resolveAsset: () => { throw new Error("no asset"); },
});

test("TTS declares the exact audio request shapes", () => {
  assert.deepEqual(ttsModels, ["voice-design-1", "mimo-v2.5-tts-voicedesign", "eleven_ttv_v3", "voice-clone", "mimo-v2.5-tts-voiceclone"]);
  assert.ok(Object.values(ttsPorts).every((ports) => ports.result === "audio"));
  assert.ok(Object.values(ttsEndpoints).every((endpoint) => endpoint.returns.name === generationTypes.audioSet.name));
  assert.throws(() => sealTtsRequest("mimo-v2.5-tts-voicedesign", {
    text: ["Do not rewrite me."],
  }), /voiceDescription is required/u);
  assert.throws(() => sealTtsRequest("mimo-v2.5-tts-voiceclone", {
    text: ["Do not rewrite me."],
  }), /voiceReference is required/u);
});

test("the installed author package contributes the two explicit speech operations", () => {
  assert.equal(mimoNodePackage.format, "hypit.node-package@1");
  assert.equal(mimoNodePackage.modules[0]?.manifest.version, "1");
  assert.deepEqual(ttsMarkupSurfaces.map((surface) => surface.name), ["voiceDesign", "voiceClone"]);
});

test("VoiceDesign publishes one reusable voice reference", async () => {
  const result = await decodeVoiceDesignSurface(context(`<tts:VoiceDesign id="host" speech={story.segment.opening.speech}>
    A clear, confident young woman with a grounded conversational tone.
  </tts:VoiceDesign>`));
  assert.deepEqual(result.components[0]!.outputs, { audio: "host.reference" });
  const exported = result.fragments[0]!.exports.find((item) => item.name === "audio");
  assert.deepEqual(exported?.type, artifactTypes.blob);
  assert.deepEqual(result.components[0]!.inputs["speech:text"], {
    kind: "record",
    id: "story.segment.opening.speech",
  });
  const request = result.records[0]!.value.kind === "inline"
    ? result.records[0]!.value.value as Record<string, unknown> : {};
  assert.equal((request.ports as Record<string, unknown[]>).text, undefined);
});

test("VoiceClone binds an accepted audio Resource and publishes independent speech", async () => {
  const result = await decodeVoiceCloneSurface(context(`<tts:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}>
    Calm and restrained.
  </tts:VoiceClone>`));
  assert.deepEqual(result.components[0]!.outputs, { audio: "narration.audio" });
  assert.deepEqual(result.components[0]!.inputs["voice:artifact"], { kind: "record", id: "host.reference" });
  assert.ok(result.components[0]!.inputs["voice:binding"] !== undefined);
});

test("VoiceClone refuses a known non-audio Resource", () => {
  const image: SurfaceResolvedReference = {
    ...voiceReference,
    record: {
      ...voiceReference.record!,
      value: { kind: "blob", resource: "res_image", size: 4, mediaType: "image/png" },
    },
  };
  assert.throws(() => decodeVoiceCloneSurface(context(
    `<tts:VoiceClone id="narration" speech={story.segment.opening.speech} voice={host.reference}/>` ,
    image,
  )), /must reference audio media/u);
});

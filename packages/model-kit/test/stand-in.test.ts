import assert from "node:assert/strict";
import test from "node:test";

import { sealGenerationRequestDraft } from "@hypit/generation";
import type { GenerationPortTable } from "@hypit/generation";
import { sealText } from "@hypit/text";

import { defineExactModelModule, standInCardRequestFromDraft, standInFrameFromDraft } from "@hypit/model-kit";

const clip: GenerationPortTable = {
  model: "clip-model",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 1000 }, minItems: 1, maxItems: 1 },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "aspectRatio", value: { kind: "enum", values: ["9:16", "16:9", "1:1"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "enum", values: [-1, 4, 5, 8] }, minItems: 1, maxItems: 1 },
    { name: "generateAudio", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
  ],
  requires: [],
};
const picture: GenerationPortTable = {
  model: "picture-model",
  result: "image",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 1000 }, minItems: 1, maxItems: 1 },
    { name: "resolution", value: { kind: "enum", values: ["1K", "2K"] }, minItems: 1, maxItems: 1 },
    { name: "aspectRatio", value: { kind: "enum", values: ["3:2", "1:1"] }, minItems: 0, maxItems: 1 },
  ],
  requires: [],
};
const voice: GenerationPortTable = {
  model: "voice-model",
  result: "audio",
  ports: [{ name: "text", value: { kind: "text", maxChars: 1000 }, minItems: 1, maxItems: 1 }],
  requires: [],
};
const clock = { frameRate: { numerator: 30, denominator: 1 } };

test("a stand-in card is derived from the model's draft: frame, duration, model and prompt", () => {
  const draft = sealGenerationRequestDraft(clip, { resolution: ["720p"], aspectRatio: ["9:16"], duration: [5] });
  const request = standInCardRequestFromDraft({ ports: clip, draft, prompt: sealText("A quiet kitchen"), clock });
  assert.deepEqual(request, {
    kind: "video", width: 720, height: 1280, model: "clip-model", prompt: "A quiet kitchen",
    video: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 150 },
  });
  const spoken = standInCardRequestFromDraft({ ports: clip, draft: sealGenerationRequestDraft(clip, { resolution: ["720p"], aspectRatio: ["9:16"], duration: [5], generateAudio: [true] }), prompt: sealText("x"), clock });
  assert.equal(spoken.video?.audio, "silence", "a model that would have spoken leaves a silent track to cut against");
  assert.deepEqual(standInFrameFromDraft(clip, sealGenerationRequestDraft(clip, { resolution: ["1080p"], aspectRatio: ["16:9"], duration: [4] })),
    { width: 1920, height: 1080 });
  assert.deepEqual(standInFrameFromDraft(picture, sealGenerationRequestDraft(picture, { resolution: ["1K"] })), { width: 1024, height: 1024 });
  assert.deepEqual(standInFrameFromDraft(picture, sealGenerationRequestDraft(picture, { resolution: ["2K"], aspectRatio: ["3:2"] })), { width: 2048, height: 1366 });
});

test("what a stand-in cannot derive it refuses with the reason", () => {
  assert.throws(() => standInCardRequestFromDraft({
    ports: clip, draft: sealGenerationRequestDraft(clip, { resolution: ["720p"], aspectRatio: ["9:16"], duration: [-1] }),
    prompt: sealText("x"), clock,
  }), /automatic duration has no stand-in/u);
  assert.throws(() => standInCardRequestFromDraft({
    ports: clip, draft: sealGenerationRequestDraft(clip, { resolution: ["720p"], aspectRatio: ["9:16"], duration: [5] }), prompt: sealText("x"),
  }), /needs the piece's clock/u);
  assert.throws(() => standInCardRequestFromDraft({
    ports: voice, draft: sealGenerationRequestDraft(voice, {}), prompt: sealText("x"),
  }), /produces audio/u);
});

test("an exact model module exports one stand-in Run Fragment per picture model and none for audio", () => {
  const module = defineExactModelModule({
    module: { name: "@example/models", version: "1" },
    endpoints: [
      { key: "clip", requestTypeName: "ClipRequest", producerName: "request-clip", ports: clip },
      { key: "picture", requestTypeName: "PictureRequest", producerName: "request-picture", ports: picture },
      { key: "voice", requestTypeName: "VoiceRequest", producerName: "request-voice", ports: voice },
    ],
  });
  assert.deepEqual(Object.keys(module.runFragmentFacet!.implementation.fragments).sort(), ["clip-stand-in", "picture-stand-in"]);
  assert.equal(module.runFragmentFacet!.offers[0], "@example/models@1");
  assert.deepEqual(module.endpoints.clip.standIn!.inputs.map((input) => input.name), ["draft", "prompt", "clock"]);
  assert.deepEqual(module.endpoints.picture.standIn!.inputs.map((input) => input.name), ["draft", "prompt"]);
  assert.equal(module.endpoints.voice.standIn, undefined);
  assert.ok(module.manifest.producers.some((item) => item.name === "stand-in-request-clip"
    && item.needs[0]?.capability.name === "draw-card"));
  assert.ok(module.manifest.dependencies.some((item) => item.module.name === "@hypit/stand-in"));
});

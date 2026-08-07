import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compilePromptKit,
  promptKitSpecFromSvsRecipes,
  verifyPromptProgram,
} from "@svml/prompt-kit";
import { digestOf } from "@svml/protocol";
import { parseSvs } from "@svml/svs";
import {
  bindSpeakerPromptKit,
  renderSpeakerSpeechProgram,
  sealSpeakerTakeIntent,
  speakerMethodDefaults,
} from "@svml/seedance-speaker";

const officialUgcV1SvsSource = readFileSync(new URL("../kits/official-ugc-v1.svs", import.meta.url), "utf8");
const officialUgcV1Parsed = parseSvs(
  "official-ugc-v1.svs",
  officialUgcV1SvsSource.slice(officialUgcV1SvsSource.indexOf("<sheet")),
);
const officialUgcV1KitSpec = promptKitSpecFromSvsRecipes(
  officialUgcV1Parsed.recipes.map((item) => item.value),
  "official-ugc-v1",
);

const image = {
  kind: "blob" as const,
  digest: digestOf("speaker-image"),
  size: 100,
  mediaType: "image/png",
};

const audio = {
  kind: "blob" as const,
  digest: digestOf("speaker-audio"),
  size: 200,
  mediaType: "audio/mpeg",
};

function intent() {
  return sealSpeakerTakeIntent({
    contract: "svml.seedance-speaker-take-intent@1",
    kit: "official-ugc-v1",
    recipe: { path: "speaker.default", recordDigest: digestOf("recipe") },
    model: speakerMethodDefaults.model,
    resolution: speakerMethodDefaults.resolution,
    aspectRatio: speakerMethodDefaults.aspectRatio,
    webSearch: speakerMethodDefaults.webSearch,
    promptParameters: {},
    segment: {
      id: "opening",
      tokenStart: 0,
      tokenEndExclusive: 4,
      dialogueExcerptDigest: digestOf("dialogue"),
      dialogue: "HOST: Say exactly these words.",
    },
    references: [
      { kind: "image", artifact: image, role: "character-and-scene" },
      { kind: "audio", artifact: audio, role: "voice-timbre" },
    ],
  });
}

test("published official Kit SVS is the exact package resource compiled by the module", () => {
  assert.match(officialUgcV1SvsSource, /^<\?svml using="@svml\/prompt-kit\/svs@1"\?>/u);
  assert.equal(officialUgcV1KitSpec.id, "official-ugc-v1");
  assert.equal(officialUgcV1KitSpec.defaults.performance, "natural-explainer");
});

test("official UGC Kit emits an ordered generic Prompt Program", () => {
  const invocation = bindSpeakerPromptKit(intent());
  const prompt = compilePromptKit(officialUgcV1KitSpec, invocation);
  verifyPromptProgram(prompt);
  assert.deepEqual(prompt.blocks.map((item) => item.id), [
    "base",
    "reference-contract",
    "script-contract",
    "voice-map",
    "composition-stability",
    "camera-motion",
    "edit-rhythm",
    "performance",
    "gesture",
    "texture",
    "visible-text",
    "dialogue",
  ]);
  assert.equal(prompt.blocks[3]?.origin, "variant:voice-map:single-with-audio");
  assert.match(prompt.blocks[3]?.text ?? "", /@audio1/u);
  assert.equal(prompt.blocks[4]?.origin, "parameter:composition-stability:soft-locked");
});

test("rendering the generic Prompt Program preserves exact Seedance method and references", () => {
  const take = intent();
  const prompt = compilePromptKit(officialUgcV1KitSpec, bindSpeakerPromptKit(take));
  const program = renderSpeakerSpeechProgram(prompt, take);
  assert.equal(program.model, "seedance-2-mini");
  assert.equal(program.resolution, "720p");
  assert.equal(program.aspectRatio, "9:16");
  assert.equal(program.mode.kind, "reference");
  if (program.mode.kind !== "reference") assert.fail("expected reference mode");
  assert.deepEqual(program.mode.items.map((item) => item.kind), ["image", "audio"]);
  assert.equal(program.prompt, prompt.blocks.map((item) => item.text).join("\n\n"));
});

test("Speaker rejects invalid media while Prompt Kit rejects unknown parameters", () => {
  const base = intent();
  const { intentDigest: _digest, ...content } = base;
  assert.throws(() => sealSpeakerTakeIntent({
    ...content,
    references: [{ kind: "audio", artifact: audio, role: "voice-timbre" }],
  }), /requires 1-9 image references/u);
  assert.throws(() => sealSpeakerTakeIntent({ ...content, resolution: "1080p" }), /at most 720p/u);
  const unknown = sealSpeakerTakeIntent({ ...content, promptParameters: { "imaginary-axis": "value" } });
  assert.throws(
    () => compilePromptKit(officialUgcV1KitSpec, bindSpeakerPromptKit(unknown)),
    /parameter imaginary-axis is not declared/u,
  );
});

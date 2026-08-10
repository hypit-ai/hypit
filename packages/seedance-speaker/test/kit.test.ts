import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bindText,
  renderText,
  sealText,
  sealTextBinding,
  textTemplateFromSvsRecipes,
  verifyText,
} from "@narratage/text";
import { parseSvs } from "@narratage/svs";
import {
  createSpeakerDurationProgram,
  createSpeakerTextBindings,
  sealSpeakerTakeIntent,
  speakerMethodDefaults,
} from "@narratage/seedance-speaker";

const officialUgcV1SvsSource = readFileSync(new URL("../kits/official-ugc-v1.svs", import.meta.url), "utf8");
const officialUgcV1Parsed = parseSvs(
  "official-ugc-v1.svs",
  officialUgcV1SvsSource.slice(officialUgcV1SvsSource.indexOf("<sheet")),
);
const officialUgcV1Template = textTemplateFromSvsRecipes(
  officialUgcV1Parsed.recipes.map((item) => item.value),
  "official-ugc-v1",
);

function intent() {
  return sealSpeakerTakeIntent({
    contract: "svml.seedance-speaker-take-intent@1",
    kit: "official-ugc-v1",
    recipe: { path: "speaker.default" },
    model: speakerMethodDefaults.model,
    resolution: speakerMethodDefaults.resolution,
    aspectRatio: speakerMethodDefaults.aspectRatio,
    webSearch: speakerMethodDefaults.webSearch,
    promptParameters: {},
    references: [
      { kind: "image", role: "character-and-scene" },
      { kind: "audio", role: "voice-timbre" },
    ],
  });
}

test("official UGC Kit renders one ordinary ordered Text value", () => {
  const bindings = bindText(
    createSpeakerTextBindings(intent()),
    sealTextBinding({ name: "dialogue", mode: "set" }),
    sealText("HOST: Say exactly these words."),
  );
  const prompt = renderText(officialUgcV1Template, bindings);
  verifyText(prompt);
  assert.match(prompt.value, /^Create a realistic vertical iPhone UGC/u);
  assert.match(prompt.value, /@audio1/u);
  assert.match(prompt.value, /SCRIPT TO DELIVER:\nHOST: Say exactly these words\./u);
  assert.ok(prompt.value.indexOf("COMPOSITION STABILITY") < prompt.value.indexOf("CAMERA MOTION"));
});

test("Speaker method preserves exact Seedance settings while prompt and media stay on graph edges", () => {
  const take = intent();
  const program = createSpeakerDurationProgram(take);
  assert.equal(program.model, "seedance-2-mini");
  assert.deepEqual(program.ports.resolution, ["720p"]);
  assert.deepEqual(program.ports.aspectRatio, ["9:16"]);
  assert.equal(program.ports.referenceImage, undefined);
  assert.equal(program.ports.referenceAudio, undefined);
  assert.equal(program.ports.prompt, undefined, "prompt arrives from an explicit Text edge");
  assert.equal(program.ports.duration, undefined, "duration arrives from speech estimation");
});

test("Speaker rejects invalid media while Text Template rejects unknown parameters", () => {
  const base = intent();
  assert.throws(() => sealSpeakerTakeIntent({
    ...base,
    references: [{ kind: "audio", role: "voice-timbre" }],
  }), /requires 1-9 image references/u);
  assert.throws(() => sealSpeakerTakeIntent({ ...base, resolution: "1080p" }), /at most 720p/u);
  const unknown = sealSpeakerTakeIntent({ ...base, promptParameters: { "imaginary-axis": "value" } });
  assert.throws(
    () => renderText(officialUgcV1Template, createSpeakerTextBindings(unknown)),
    /binding imaginary-axis is not declared/u,
  );
});

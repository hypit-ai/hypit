import assert from "node:assert/strict";
import test from "node:test";
import { sealText } from "@narratage/text";

import {
  countSpeechEstimateUnits,
  estimateSpeechDuration,
  sealSpeechEstimatePolicy,
  speechEstimatePolicyFromRecipe,
} from "@narratage/estimate";

const normal = sealSpeechEstimatePolicy({
  contract: "svml.speech-estimate-policy@1",
  language: "en",
  pace: "normal",
  paddingSec: 0.3,
  minimumSec: 4,
  maximumSec: 15,
  rounding: "ceil",
});

test("normal English speech estimate follows the syllable-rate policy", () => {
  const source = sealText(
    "Video editing begins with meaning, not a pile of clips on a timeline.",
  );
  assert.equal(countSpeechEstimateUnits(source.value, "en"), 21);
  const result = estimateSpeechDuration(source, normal);
  assert.equal(result.durationSec, 5);
});

test("the minimum applies before rounding and the maximum applies after rounding", () => {
  assert.equal(estimateSpeechDuration(sealText("Hello."), normal).durationSec, 4);
  const bounded = sealSpeechEstimatePolicy({ ...normal, maximumSec: 4.5 });
  assert.equal(estimateSpeechDuration(sealText("This sentence intentionally contains far more spoken syllables than the selected model duration allows."), bounded).durationSec, 4.5);
});

test("an SVS Recipe configures one reusable estimate policy without becoming executable", () => {
  const policy = speechEstimatePolicyFromRecipe({
    contract: "svml.svs-recipe@1",
    path: "speech.normal",
    properties: {
      language: "en",
      pace: "normal",
      padding: 0.3,
      min: 4,
      max: 15,
      rounding: "ceil",
    },
  });
  assert.equal(policy.language, "en");
  assert.equal(policy.maximumSec, 15);
  assert.throws(() => speechEstimatePolicyFromRecipe({
    contract: "svml.svs-recipe@1",
    path: "speech.invalid",
    properties: { provider: "gemini" },
  }), /unknown property provider/u);
});

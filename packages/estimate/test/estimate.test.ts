import assert from "node:assert/strict";
import test from "node:test";
import { sealText } from "@hypit/text";

import {
  countSpeechEstimateUnits,
  estimateSpeechDuration,
  sealSpeechEstimatePolicy,
  speechEstimatePolicyFromAttributes,
  speechEstimatePolicyFromRecipe,
} from "@hypit/estimate";

const normal = sealSpeechEstimatePolicy({
  language: "en",
  pace: "normal",
  rounding: "round",
});

test("English dictionary pronunciation drives ordinary word syllables", () => {
  assert.equal(countSpeechEstimateUnits("Video presented needed ideas queue.", "en"), 12);
  assert.equal(countSpeechEstimateUnits("I'm going back-and-forth.", "en"), 6);
  assert.equal(countSpeechEstimateUnits("I’m going back-and-forth.", "en"), 6);
  assert.equal(countSpeechEstimateUnits("45%", "en"), 0);
});

test("normal English speech estimate follows the delivery-density policy", () => {
  const source = sealText(
    "Video editing begins with meaning, not a pile of clips on a timeline.",
  );
  assert.equal(countSpeechEstimateUnits(source.value, "en"), 20);
  const result = estimateSpeechDuration(source, normal);
  assert.equal(result, 4);
});

test("English pace presets occupy adjacent integer durations", () => {
  const source = sealText(Array.from({ length: 49 }, () => "day").join(" "));
  const estimate = (pace: "slow" | "normal" | "fast") => estimateSpeechDuration(
    source,
    sealSpeechEstimatePolicy({
      language: normal.language,
      pace,
      rounding: normal.rounding,
    }),
  );
  assert.deepEqual([estimate("slow"), estimate("normal"), estimate("fast")], [12, 11, 10]);
});

test("a numeric rate gives SVS a continuous author-controlled pace", () => {
  const source = sealText(Array.from({ length: 49 }, () => "day").join(" "));
  const result = estimateSpeechDuration(source, sealSpeechEstimatePolicy({
    language: normal.language,
    rate: 4.75,
    rounding: normal.rounding,
  }));
  assert.equal(result, 10);
});

test("optional padding extends speech before rounding", () => {
  const source = sealText(Array.from({ length: 23 }, () => "day").join(" "));
  const policy = sealSpeechEstimatePolicy({
    language: "en",
    pace: "normal",
    rounding: "none",
    paddingSec: 1,
  });
  assert.equal(estimateSpeechDuration(source, policy), 6);

  const recipe = speechEstimatePolicyFromRecipe({
    path: "speech.padded",
    properties: {
      language: "en",
      pace: "normal",
      rounding: "none",
      padding: 1,
    },
  });
  assert.equal(recipe.paddingSec, 1);
  assert.throws(() => sealSpeechEstimatePolicy({ ...policy, paddingSec: -1 }), /invalid/u);
});

test("a policy written as attributes reads the same values a Recipe would", () => {
  const policy = speechEstimatePolicyFromAttributes(
    { language: "en", rate: "4.75", rounding: "round" },
    "estimated:SemanticTake",
  );
  assert.equal(policy.rate, 4.75);
  assert.throws(
    () => speechEstimatePolicyFromAttributes({ language: "en", pace: "normal", rate: "4.75", rounding: "round" }, "x"),
    /exactly one/u,
  );
  assert.throws(() => speechEstimatePolicyFromAttributes({ rate: "4.75" }, "x"), /requires language, rounding/u);
});

test("short and long passages retain their estimated duration", () => {
  const exact = sealSpeechEstimatePolicy({ ...normal, rounding: "none" });
  assert.equal(estimateSpeechDuration(sealText("Hello."), exact), 2 / 4.6);
  const long = sealText(Array.from({ length: 460 }, () => "day").join(" "));
  assert.equal(estimateSpeechDuration(long, normal), 100);
});

test("rounding a short passage to zero reports how to retain a positive duration", () => {
  assert.throws(() => estimateSpeechDuration(sealText("Hello."), normal), /rounds to zero.*none or ceil/u);
  assert.equal(estimateSpeechDuration(sealText("Hello."), { ...normal, rounding: "ceil" }), 1);
});

test("an SVS Recipe configures one reusable estimate policy without becoming executable", () => {
  const policy = speechEstimatePolicyFromRecipe({
    path: "speech.normal",
    properties: {
      language: "en",
      rate: 4.75,
      rounding: "round",
    },
  });
  assert.equal(policy.language, "en");
  assert.equal(policy.rate, 4.75);
  assert.throws(() => speechEstimatePolicyFromRecipe({
    path: "speech.ambiguous",
    properties: { pace: "normal", rate: 4.6 },
  }), /exactly one|requires/u);
  assert.throws(() => speechEstimatePolicyFromRecipe({
    path: "speech.invalid",
    properties: { provider: "unknown-provider" },
  }), /unknown property/u);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredElement } from "@narratage/markup";
import { sealText, textTypes } from "@narratage/text";

import {
  countSpeechEstimateUnits,
  decodeSpeechEstimateSurface,
  estimateSpeechDuration,
  sealSpeechEstimatePolicy,
  speechEstimatePolicyFromRecipe,
} from "@narratage/estimate";

function estimateSurface(source: string) {
  return decodeSpeechEstimateSurface({
    sourceName: "estimate.svml",
    element: parseStructuredElement({ name: "estimate.svml", text: source }, 0).element,
    resolveReference: (path) => path === "speech"
      ? { path, ref: { kind: "record", id: path }, type: textTypes.text }
      : undefined,
    resolveAsset: () => { throw new Error("Estimate has no assets"); },
  });
}

const normal = sealSpeechEstimatePolicy({

  language: "en",
  pace: "normal",
  minimumSec: 4,
  maximumSec: 15,
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
      minimumSec: normal.minimumSec,
      maximumSec: normal.maximumSec,
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
    minimumSec: normal.minimumSec,
    maximumSec: normal.maximumSec,
    rounding: normal.rounding,
  }));
  assert.equal(result, 10);
});

test("the author Surface requires one complete explicit inline policy", async () => {
  const output = await estimateSurface('<estimate:Speech id="duration" source={speech} language="en" rate="4.75" min="4" max="15" rounding="round"/>');
  const value = output.records[0]!.value;
  assert.equal(value.kind, "inline");
  assert.equal(value.kind === "inline" && (value.value as { readonly rate?: number }).rate, 4.75);
  assert.throws(
    () => estimateSurface('<estimate:Speech id="duration" source={speech} language="en" pace="normal" rate="4.75" min="4" max="15" rounding="round"/>'),
    /exactly one/u,
  );
  assert.throws(() => estimateSurface('<estimate:Speech id="duration" source={speech} rate="4.75"/>'), /requires/u);
});

test("the minimum applies before rounding and the maximum applies after rounding", () => {
  assert.equal(estimateSpeechDuration(sealText("Hello."), normal), 4);
  const bounded = sealSpeechEstimatePolicy({ ...normal, maximumSec: 4.5 });
  assert.equal(estimateSpeechDuration(sealText("This sentence intentionally contains far more spoken syllables than the selected model duration allows."), bounded), 4.5);
});

test("an SVS Recipe configures one reusable estimate policy without becoming executable", () => {
  const policy = speechEstimatePolicyFromRecipe({

    path: "speech.normal",
    properties: {
      language: "en",
      rate: 4.75,
      min: 4,
      max: 15,
      rounding: "round",
    },
  });
  assert.equal(policy.language, "en");
  assert.equal(policy.rate, 4.75);
  assert.equal(policy.maximumSec, 15);
  assert.throws(() => speechEstimatePolicyFromRecipe({

    path: "speech.ambiguous",
    properties: { pace: "normal", rate: 4.6 },
  }), /exactly one/u);
  assert.throws(() => speechEstimatePolicyFromRecipe({

    path: "speech.invalid",
    properties: { provider: "gemini" },
  }), /unknown property provider/u);
});

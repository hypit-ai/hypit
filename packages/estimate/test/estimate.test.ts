import assert from "node:assert/strict";
import test from "node:test";

import type { NarrativeSpeechExcerpt } from "@svml/contracts";
import {
  countSpeechEstimateUnits,
  estimateSpeechDuration,
  sealSpeechEstimatePolicy,
} from "@svml/estimate";
import { canonicalize, digestOf } from "@svml/protocol";

function excerpt(id: string, speech: string): NarrativeSpeechExcerpt {
  const content = {
    contract: "svml.narrative-speech-excerpt@1" as const,
    kind: "segment" as const,
    id,
    tokenStart: 0,
    tokenEndExclusive: speech.trim().split(/\s+/u).length,
    speech,
  };
  return { ...content, excerptDigest: digestOf(canonicalize(content)) };
}

const normal = sealSpeechEstimatePolicy({
  contract: "svml.speech-estimate-policy@1",
  language: "en",
  pace: "normal",
  paddingSec: 0.3,
  minimumSec: 4,
  maximumSec: 15,
  rounding: "ceil",
});

test("normal English speech estimate preserves the old syllable-rate policy", () => {
  const source = excerpt(
    "opening",
    "Video editing begins with meaning, not a pile of clips on a timeline.",
  );
  assert.equal(countSpeechEstimateUnits(source.speech, "en"), 21);
  const result = estimateSpeechDuration(source, normal);
  assert.equal(result.durationSec, 5);
  assert.equal(result.segmentId, source.id);
  assert.equal(result.sourceSpeechExcerptDigest, source.excerptDigest);
});

test("the minimum applies before rounding and the maximum applies after rounding", () => {
  assert.equal(estimateSpeechDuration(excerpt("short", "Hello."), normal).durationSec, 4);
  const { policyDigest: _digest, ...normalContent } = normal;
  const bounded = sealSpeechEstimatePolicy({ ...normalContent, maximumSec: 4.5 });
  assert.equal(estimateSpeechDuration(excerpt("long", "This sentence intentionally contains far more spoken syllables than the selected model duration allows."), bounded).durationSec, 4.5);
});

import assert from "node:assert/strict";
import test from "node:test";

import { planCaptionPresentation, temporalizeCaption } from "@svml/caption";
import { parseScript } from "@svml/script";
import { locateSpeechTiming } from "@svml/speech-align";

test("Caption temporalization preserves evidence envelopes and labels local estimates", () => {
  const narrative = parseScript(
    "caption.svml",
    "<line><that was insane | what the fuck> <15% off | fifteen percent off></line>",
  );
  const map = locateSpeechTiming(narrative, {
    contract: "svml.aligned-transcript-evidence@0",
    durationSec: 2,
    segments: [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 2,
      words: [
        { text: "what", startSec: 0.1, endSec: 0.25 },
        { text: "the", startSec: 0.3, endSec: 0.42 },
        { text: "fuck", startSec: 0.48, endSec: 0.72 },
        { text: "fifteen", startSec: 0.9, endSec: 1.15 },
        { text: "percent", startSec: 1.2, endSec: 1.42 },
        { text: "off", startSec: 1.48, endSec: 1.65 },
      ],
      chars: [],
    }],
  });
  const originalMap = structuredClone(map);
  const timed = temporalizeCaption(narrative, map);

  assert.equal(timed.regions[0]?.display, "that was insane");
  assert.deepEqual(
    [timed.regions[0]?.startSec, timed.regions[0]?.endSec, timed.regions[0]?.refinements.length],
    [0.1, 0.72, 0],
  );
  assert.deepEqual(timed.regions[1]?.refinements.map((item) => item.display), ["off"]);

  const whole = planCaptionPresentation(timed, "whole");
  assert.deepEqual(
    [whole.units[0]?.display, whole.units[0]?.startSec, whole.units[0]?.endSec, whole.units[0]?.basis],
    ["that was insane", 0.1, 0.72, "region-envelope"],
  );

  const words = planCaptionPresentation(timed, "proportional-word");
  assert.deepEqual(words.units.slice(0, 3).map((unit) => unit.basis), [
    "presentation-estimate",
    "presentation-estimate",
    "presentation-estimate",
  ]);
  assert.equal(words.units.find((unit) => unit.display === "off")?.basis, "exact-correspondence");
  assert.equal(words.units.find((unit) => unit.display === "15")?.timingQuality, "estimated");
  assert.deepEqual(map, originalMap, "caption presentation must not modify the global speech map");
});

test("hidden speech owns time but emits no visible presentation unit", () => {
  const narrative = parseScript("hidden.svml", "<line>Hello < | um> world.</line>");
  const map = locateSpeechTiming(narrative, {
    contract: "svml.aligned-transcript-evidence@0",
    durationSec: 1,
    segments: [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 1,
      words: [
        { text: "Hello", startSec: 0.1, endSec: 0.25 },
        { text: "um", startSec: 0.3, endSec: 0.4 },
        { text: "world", startSec: 0.45, endSec: 0.7 },
      ],
      chars: [],
    }],
  });
  const timed = temporalizeCaption(narrative, map);
  const hidden = timed.regions.find((region) => region.kind === "hidden");
  assert.deepEqual([hidden?.startSec, hidden?.endSec], [0.3, 0.4]);
  assert.equal(planCaptionPresentation(timed).units.some((unit) => unit.regionId === hidden?.id), false);
});

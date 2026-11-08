import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCaptionDocument,
  assertLocalCaptionTiming,
  captionCueText,
  captionSelectionForRole,
  captionSelectedUnitIds,
  captionUnitText,
  captionWordIdsForAttribute,
  type CaptionDocument,
  type LocalCaptionTiming,
} from "../src/index.js";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });

const document: CaptionDocument = {
  id: "story.caption",
  words: [
    { id: "word-one", unitId: "unit-one", text: "First", separatorBefore: "", attributes: [] },
    { id: "word-two", unitId: "unit-two", text: "Second", separatorBefore: " ",
      attributes: [{ name: "face", value: "serif" }] },
  ],
  units: [
    { id: "unit-one", wordIds: ["word-one"] },
    { id: "unit-two", wordIds: ["word-two"] },
  ],
  cues: [
    { id: "cue-one", unitIds: ["unit-one"], role: "HOST" },
    { id: "cue-two", unitIds: ["unit-two"] },
  ],
};

test("CaptionDocument owns display, Cue grouping and family-defined word attributes only", () => {
  assert.doesNotThrow(() => assertCaptionDocument(document));
  assert.deepEqual(captionSelectedUnitIds(document, { kind: "cues", ids: ["cue-two"] }), ["unit-two"]);
  assert.equal(captionCueText(document, "cue-two"), " Second");
  assert.equal(captionUnitText(document, ["unit-one", "unit-two"]), "First Second");
  assert.deepEqual(captionSelectionForRole(document, "HOST"), { kind: "units", ids: ["unit-one"] });
  assert.deepEqual(captionWordIdsForAttribute(document, "face"), ["word-two"]);
  assert.deepEqual(document.words[1]?.attributes, [{ name: "face", value: "serif" }]);
});

test("Caption Cues partition every Unit exactly", () => {
  assert.throws(() => assertCaptionDocument({
    ...document,
    cues: [{ id: "cue-one", unitIds: ["unit-one"] }],
  }), /partition all Units/u);
  assert.throws(() => assertCaptionDocument({
    ...document,
    cues: [
      { id: "cue-one", unitIds: ["unit-one", "unit-two"] },
      { id: "cue-two", unitIds: ["unit-two"] },
    ],
  }), /more than one Cue/u);
});

test("LocalCaptionTiming stays source-local and contains no NLE placement", () => {
  const domain = sealLocalTemporalDomain({ id: "speech", duration: at(2) });
  const timing: LocalCaptionTiming = {
    documentId: document.id,
    domain,
    units: [
      { unitId: "unit-one", regions: [{ start: { position: at(0), side: "after" },
        end: { position: at(1), side: "before" } }] },
      { unitId: "unit-two", regions: [{ start: { position: at(1), side: "after" },
        end: { position: at(2), side: "before" } }] },
    ],
  };
  assert.doesNotThrow(() => assertLocalCaptionTiming(timing));
  assert.deepEqual(timing.domain, domain);
});

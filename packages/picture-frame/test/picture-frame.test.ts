import assert from "node:assert/strict";
import test from "node:test";

import { readHtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/protocol";
import { createNleLoweringHostFromFacets } from "@hypit/nle";

import { hypitPackage } from "../src/activation.js";
import {
  pictureFrameNleAuthoring,
  pictureFrameNleSymbol,
  pictureFrameOperator,
  type PictureFrameTreatment,
} from "../src/index.js";

const treatment: PictureFrameTreatment = {
  clip: { kind: "path", commands: [
    { kind: "move", x: 0, y: 20 },
    { kind: "quadratic", controlX: 0, controlY: 0, x: 20, y: 0 },
    { kind: "line", x: 180, y: 0 },
    { kind: "cubic", control1X: 195, control1Y: 0, control2X: 200, control2Y: 5, x: 200, y: 20 },
    { kind: "line", x: 200, y: 100 },
    { kind: "close" },
  ] },
  padding: { topPx: 8, rightPx: 12, bottomPx: 8, leftPx: 12 },
  border: { widthPx: 2, style: "solid", color: "#fff" },
  shadows: [
    { offsetX: 0, offsetY: 8, blurPx: 24, spreadPx: 0, color: "rgba(0,0,0,.4)" },
    { offsetX: 0, offsetY: 0, blurPx: 2, spreadPx: 1, color: "#fff" },
  ],
};

test("Picture Frame preserves structured path, padding, border and multi-shadow treatment", () => {
  const visual = readHtmlVisual(pictureFrameOperator(treatment).program);
  assert.match(visual.html, /\{\{picture\}\}/u);
  assert.match(visual.setup ?? "", /clipPath/u);
  assert.match(visual.setup ?? "", /boxShadow/u);
  assert.deepEqual(visual.data, treatment);
  assert.throws(() => pictureFrameOperator({
    ...treatment,
    padding: { ...treatment.padding, leftPx: -1 },
  }), /must not be negative/u);
});

test("Picture Frame is an ordinary materialized NLE Adjustment with package-owned editing", () => {
  const adjustment = {
    id: "card-frame", kind: "adjustment" as const,
    operator: pictureFrameNleSymbol,
    parameters: canonicalize({ treatment }),
  };
  const resolved = createNleLoweringHostFromFacets(hypitPackage.facets)
    .resolvePictureOperator(adjustment as never, {} as never);
  assert.deepEqual(resolved, { operator: pictureFrameOperator(treatment) });
  assert.deepEqual(pictureFrameNleAuthoring.edit({
    kind: "set-treatment",
    treatment: { ...treatment, clip: { kind: "rounded", radiusPx: 32 } },
  }, { application: adjustment } as never), canonicalize({
    treatment: { ...treatment, clip: { kind: "rounded", radiusPx: 32 } },
  }));
});

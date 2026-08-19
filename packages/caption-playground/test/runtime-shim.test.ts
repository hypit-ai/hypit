import assert from "node:assert/strict";
import test from "node:test";

import { sealComposition, sealVisualTrack } from "@hypit/composition";
import { compileHyperframesDocument } from "@hypit/hyperframes";
import { sealProgramSpace } from "@hypit/program-space";

import { injectRuntimeShim } from "../src/preview/runtime-shim.js";

const space = sealProgramSpace({
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});

function document_() {
  return compileHyperframesDocument(sealComposition({
    id: "caption-preview",
    canvas: { width: 1080, height: 1920, clearColor: "#09090b" },
    tracks: [sealVisualTrack({
      visualIr: "hypit.visual-ir@1",
      id: "caption",
      presents: [{
        id: "one", span: { startFrame: 0, endFrameExclusive: 30 },
        stacking: { order: 10, tieBreak: "caption" },
        elements: [{ id: "root", order: 0, kind: "box", style: [{ name: "position", value: "absolute" }] }],
      }],
    })],
  }), space);
}

test("Caption preview shim sizes the Hyperframes root and supplies a seekable timeline", () => {
  const { html } = document_();
  const rootRule = /\[data-composition-id\]\{([^}]*)\}/u.exec(html);
  assert.notEqual(rootRule, null);
  assert.doesNotMatch(rootRule![1]!, /(^|;)\s*(width|height)\s*:/u);
  assert.doesNotMatch(html, /visibility\s*:/u);
  const output = injectRuntimeShim(html);
  assert.match(output, /root\.style\.height/u);
  assert.match(output, /__svmlSeekFrame/u);
  assert.match(output, /visibility/u);
  assert.ok(output.lastIndexOf("<script>") < output.lastIndexOf("</body>"));
});

test("Caption preview shim is still injected when body close is absent", () => {
  assert.match(injectRuntimeShim("<!doctype html><html></html>"), /__svmlSeekFrame/u);
});

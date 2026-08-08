import assert from "node:assert/strict";
import test from "node:test";

import { sealComposition, sealVisualTrack } from "@narratage/composition";
import { compileHyperframesDocument } from "@narratage/hyperframes";
import { sealProgramSpace } from "@narratage/program-space";

import { injectRuntimeShim } from "../tools/playground/src/preview/runtime-shim.js";

/**
 * The playground shows the compiled document directly in an iframe, so it must
 * supply the two things a real render gets from the HyperFrames producer: a
 * sized composition root, and a timeline. Both are absences in the document
 * rather than statements in it, which makes them easy to regress silently —
 * these tests pin the absences so the shim's reason for existing stays visible.
 */

const programSpace = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});

function document_() {
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: "shot",
    presents: [{
      id: "one",
      span: { startFrame: 0, endFrameExclusive: 30 },
      stacking: { order: 10, tieBreak: "shot" },
      elements: [{
        id: "root",
        order: 0,
        kind: "box",
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 }],
      }],
    }],
  });
  return compileHyperframesDocument(sealComposition({
    contract: "svml.composition@1",
    id: "shim-fixture",
    canvas: { width: 1080, height: 1920, clearColor: "#09090b" },
    tracks: [track],
  }), programSpace);
}

test("the compiled document states its frame size only as data, never as layout", () => {
  const { html } = document_();
  // The size is present to read...
  assert.match(html, /data-width="1080"/u);
  assert.match(html, /data-height="1920"/u);
  // ...but the root's own rule carries no width or height, so the element
  // computes to zero height and clips every Present away. If this assertion
  // ever fails the upstream compiler started sizing the root and the shim can
  // stop doing it.
  const rootRule = /\[data-composition-id\]\{([^}]*)\}/u.exec(html);
  assert.notEqual(rootRule, null, "the compiled stylesheet must scope a rule to the composition root");
  assert.doesNotMatch(rootRule![1]!, /(^|;)\s*(width|height)\s*:/u);
});

test("the compiled document gates no Present and delays no animation", () => {
  const { html } = document_();
  assert.match(html, /class="clip svml-visual-present"/u);
  // data-start is metadata, not a rule: nothing hides a Present outside its span.
  assert.doesNotMatch(html, /visibility\s*:/u);
  assert.doesNotMatch(html, /animation-delay/u);
});

test("the shim supplies the size and the timeline, immediately before body close", () => {
  const shimmed = injectRuntimeShim(document_().html);
  assert.match(shimmed, /root\.style\.height/u);
  assert.match(shimmed, /__svmlSeekFrame/u);
  assert.match(shimmed, /visibility/u);
  const script = shimmed.lastIndexOf("<script>");
  assert.ok(script !== -1 && script < shimmed.lastIndexOf("</body>"),
    "the shim must run after the elements it seeks exist");
});

test("a document without a body close still receives the shim", () => {
  assert.match(injectRuntimeShim("<!doctype html><html></html>"), /__svmlSeek/u);
});

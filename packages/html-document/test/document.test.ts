import assert from "node:assert/strict";
import test from "node:test";
import { sealComposition, sealVisualTrack, VISUAL_IR_V1 } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";
import { compileHtmlDocument, materializeHtmlDocument } from "@hypit/html-document";

test("authored text with dollar signs survives document materialization", () => {
  const label = "Price tier: $$$ (it's $' and $& and $`)";
  const timeline = sealTimeline({ id: "t", frameCount: 30, frameRate: { numerator: 30, denominator: 1 } });
  const visual = sealVisualTrack({ id: "scene", timelineId: timeline.id, visualIr: VISUAL_IR_V1,
    presents: [{ id: "scene", order: 0, z: 0, span: { startFrame: 0, endFrameExclusive: 30 },
      elements: [{ id: "root", kind: "program", order: 0, style: [], program: htmlVisual({
        html: "<p class='label'></p>",
        setup: "return () => { root.querySelector('.label').textContent = data.label; };",
        data: { label },
      }) }] }] });
  const composition = sealComposition({ id: "scene", canvas: { width: 200, height: 200, clearColor: "#000000" },
    tracks: [visual] });
  const page = materializeHtmlDocument(compileHtmlDocument(composition, timeline), (asset) => `/r/${asset.resource}`);

  assert.ok(page.includes(JSON.stringify(label).slice(1, -1)), "the label reaches the page unchanged");
  assert.equal(page.split("</body>").length - 1, 1, "the page closes its body once");
});

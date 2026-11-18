import assert from "node:assert/strict";
import test from "node:test";
import type { StudioInspectorField } from "@hypit/studio-companion";
import { resolveFrameEditModel, solveFrameGesture } from "../src/frame-edit.js";

function frameField(
  binding: string,
  value: string,
  rangeStart: number,
  writable = true,
): StudioInspectorField {
  return {
    id: `item:inspector:${binding}`,
    binding,
    label: binding,
    domain: "where",
    section: { id: "frame", label: "Frame" },
    control: "number",
    value,
    number: { suffixes: ["%", "px"], step: 1 },
    ...(writable ? {
      edit: {
        language: "svml",
        source: {
          path: "main.svml",
          range: { start: rangeStart, end: rangeStart + value.length },
          preimage: value,
        },
      },
    } : {}),
  };
}

const workbenchSvml = `<svml>
  <spatial:Canvas id="canvas" width="1080" height="1920"/>
  <spatial:Frame id="backdrop-frame" within={canvas.bounds}
    left="0%" top="0%" right="100%" bottom="100%"/>
  <spatial:AnchoredFrame id="product-frame" within={canvas.bounds}
    x="79%" y="68%" width="320px" height="320px" anchor="center"/>
  <spatial:AnchoredFrame id="headline-frame" within={canvas.bounds}
    x="8%" y="10%" width="620px" height="160px" anchor="top-left"/>
  <spatial:AspectFrame id="badge-frame" within={canvas.bounds}
    x="92%" y="8%" width="120px" aspect="1/1" anchor="top-right"/>
</svml>`;

const canvas = { width: 1080, height: 1920 };
const sourceFiles = [{ path: "main.svml", text: workbenchSvml, language: "svml" as const, role: "author" as const, imports: [] }];

test("moving and resizing AnchoredFrame with center anchor preserves units and pins opposite corner", () => {
  const tagAt = workbenchSvml.indexOf('id="product-frame"');
  const inspector = [
    frameField("frame.x", "79%", tagAt + 20),
    frameField("frame.y", "68%", tagAt + 30),
    frameField("frame.width", "320px", tagAt + 40),
    frameField("frame.height", "320px", tagAt + 55),
  ];
  // 79% of 1080 = 853.2, center-anchored 320 -> left = 693.2; 68% of 1920 = 1305.6 -> top = 1145.6
  const initialBox = { xPx: 693.2, yPx: 1145.6, widthPx: 320, heightPx: 320 };
  const model = resolveFrameEditModel({ inspector, canvas, sourceFiles, drawnBox: initialBox });
  assert.ok(model !== undefined);
  assert.equal(model.kind, "anchored");
  assert.deepEqual(model.anchor, { x: 0.5, y: 0.5 });

  // Move left by 540px (-50% of 1080) and up by 960px (-50% of 1920)
  const moved = solveFrameGesture({
    model,
    initialBox,
    gesture: "move",
    deltaXPx: -540,
    deltaYPx: -960,
    canvas,
    disableSnap: true,
  });
  assert.deepEqual(moved.edits.map((e) => [e.binding, e.value, e.suffix]), [
    ["frame.x", 29, "%"],
    ["frame.y", 18, "%"],
  ]);

  // Resize SE handle to 60% of 320px (= 192px, delta = -128px): top-left stays at (693.2, 1145.6)
  const resized = solveFrameGesture({
    model,
    initialBox,
    gesture: "se",
    deltaXPx: -128,
    deltaYPx: -128,
    canvas,
    disableSnap: true,
  });
  assert.equal(Math.round(resized.box.xPx * 10) / 10, 693.2);
  assert.equal(Math.round(resized.box.yPx * 10) / 10, 1145.6);
  assert.equal(resized.box.widthPx, 192);
  assert.equal(resized.box.heightPx, 192);
  const byBinding = new Map(resized.edits.map((e) => [e.binding, e.value]));
  assert.equal(byBinding.get("frame.width"), 192);
  assert.equal(byBinding.get("frame.height"), 192);
  // Center moved left by 64px (-5.93% of 1080 -> 79 - 5.93 = 73.07%) and up by 64px (-3.33% of 1920 -> 64.67%)
  assert.equal(byBinding.get("frame.x"), 73.07);
  assert.equal(byBinding.get("frame.y"), 64.67);
});

test("resizing top-left AnchoredFrame from SE handle updates only width and height", () => {
  const tagAt = workbenchSvml.indexOf('id="headline-frame"');
  const inspector = [
    frameField("frame.x", "8%", tagAt + 20),
    frameField("frame.y", "10%", tagAt + 30),
    frameField("frame.width", "620px", tagAt + 40),
    frameField("frame.height", "160px", tagAt + 55),
  ];
  const initialBox = { xPx: 86.4, yPx: 192, widthPx: 620, heightPx: 160 };
  const model = resolveFrameEditModel({ inspector, canvas, sourceFiles, drawnBox: initialBox })!;
  assert.equal(model.kind, "anchored");
  assert.deepEqual(model.anchor, { x: 0, y: 0 });

  const resized = solveFrameGesture({
    model,
    initialBox,
    gesture: "se",
    deltaXPx: -120,
    deltaYPx: 40,
    canvas,
    disableSnap: true,
  });
  assert.deepEqual(resized.edits.map((e) => [e.binding, e.value]), [
    ["frame.width", 500],
    ["frame.height", 200],
  ]);
});

test("AspectFrame locks ratio and adjusts only declared primary size plus anchor coordinates", () => {
  const tagAt = workbenchSvml.indexOf('id="badge-frame"');
  const inspector = [
    frameField("frame.x", "92%", tagAt + 20),
    frameField("frame.y", "8%", tagAt + 30),
    frameField("frame.width", "120px", tagAt + 40),
  ];
  // 92% of 1080 = 993.6, top-right anchor -> left = 873.6; 8% of 1920 = 153.6
  const initialBox = { xPx: 873.6, yPx: 153.6, widthPx: 120, heightPx: 120 };
  const model = resolveFrameEditModel({ inspector, canvas, sourceFiles, drawnBox: initialBox })!;
  assert.equal(model.kind, "aspect");
  assert.deepEqual(model.anchor, { x: 1, y: 0 });

  // Dragging SW handle keeps top-right corner pinned, so x and y stay untouched!
  const swResize = solveFrameGesture({
    model,
    initialBox,
    gesture: "sw",
    deltaXPx: -60,
    deltaYPx: 20,
    canvas,
    disableSnap: true,
  });
  assert.equal(swResize.box.widthPx, 180);
  assert.equal(swResize.box.heightPx, 180);
  assert.deepEqual(swResize.edits.map((e) => [e.binding, e.value]), [
    ["frame.width", 180],
  ]);
});

test("Frame edges emit outer edge before inner edge on positive translation and snap to sibling edges", () => {
  const tagAt = workbenchSvml.indexOf('id="backdrop-frame"');
  const inspector = [
    frameField("frame.left", "10%", tagAt + 20),
    frameField("frame.top", "10%", tagAt + 30),
    frameField("frame.right", "50%", tagAt + 40),
    frameField("frame.bottom", "30%", tagAt + 50),
  ];
  const initialBox = { xPx: 108, yPx: 192, widthPx: 432, heightPx: 384 };
  const model = resolveFrameEditModel({ inspector, canvas, sourceFiles, drawnBox: initialBox })!;
  assert.equal(model.kind, "edges");

  // Sibling at xPx = 600, yPx = 600: moving right by +489px (to 597) snaps left edge to 600 (+492px)
  // Note new left (600px = 55.56%) > old right (50%), so frame.right MUST be emitted before frame.left!
  const sibling = { xPx: 600, yPx: 600, widthPx: 200, heightPx: 200 };
  const moved = solveFrameGesture({
    model,
    initialBox,
    gesture: "move",
    deltaXPx: 489,
    deltaYPx: 0,
    canvas,
    siblings: [sibling],
    snapThresholdPx: 6,
  });
  assert.equal(moved.box.xPx, 600);
  assert.equal(moved.guides.length, 1);
  assert.equal(moved.guides[0]?.axis, "x");
  assert.equal(moved.guides[0]?.positionPx, 600);
  assert.deepEqual(moved.edits.map((e) => e.binding), ["frame.right", "frame.left"]);
  assert.equal(moved.gap?.axis, "y");
  assert.equal(moved.gap?.distancePx, 24);
});

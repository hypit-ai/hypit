import assert from "node:assert/strict";
import test from "node:test";

import { findOpenCanvasPosition, resolveCanvasSnap } from "../src/client/canvas-snapping.js";

const target = { id: "target", x: 200, y: 40, width: 100, height: 80 };

test("Canvas snapping aligns edges within five screen pixels", () => {
  const resolved = resolveCanvasSnap(
    { id: "moving", x: 102, y: 200, width: 100, height: 80 },
    [target],
    1,
  );
  assert.equal(resolved.x, 100);
  assert.equal(resolved.guides[0]?.axis, "x");
  assert.equal(resolved.guides[0]?.coordinate, 200);
});

test("equal cards expose left, centre, right, top, middle and bottom alignments together", () => {
  const resolved = resolveCanvasSnap(
    { id: "moving", x: 202, y: 202, width: 100, height: 80 },
    [{ ...target, y: 200 }],
    1,
  );
  assert.equal(resolved.x, 200);
  assert.equal(resolved.y, 200);
  assert.deepEqual(
    resolved.guides.filter(guide => guide.axis === "x").map(guide => guide.coordinate),
    [200, 250, 300],
  );
  assert.deepEqual(
    resolved.guides.filter(guide => guide.axis === "y").map(guide => guide.coordinate),
    [200, 240, 280],
  );
});

test("guides at one shared anchor merge across every aligned target", () => {
  const resolved = resolveCanvasSnap(
    { id: "moving", x: 202, y: 200, width: 100, height: 80 },
    [target, { id: "lower", x: 200, y: 360, width: 100, height: 80 }],
    1,
  );
  const left = resolved.guides.find(guide => guide.axis === "x" && guide.coordinate === 200);
  assert.deepEqual(left, { axis: "x", coordinate: 200, start: 120, end: 360 });
});

test("an active alignment holds until eight screen pixels away", () => {
  const entered = resolveCanvasSnap(
    { id: "moving", x: 102, y: 200, width: 100, height: 80 },
    [target],
    1,
  );
  const held = resolveCanvasSnap(
    { id: "moving", x: 107, y: 200, width: 100, height: 80 },
    [target],
    1,
    entered.state,
  );
  assert.equal(held.x, 100);
  const released = resolveCanvasSnap(
    { id: "moving", x: 109, y: 200, width: 100, height: 80 },
    [target],
    1,
    held.state,
  );
  assert.equal(released.x, 109);
  assert.equal(released.state.x, undefined);
});

test("snapping tolerances stay in screen pixels across zoom levels", () => {
  const resolved = resolveCanvasSnap(
    { id: "moving", x: 103, y: 200, width: 100, height: 80 },
    [target],
    2,
  );
  assert.equal(resolved.x, 103);
  assert.equal(resolved.state.x, undefined);
});

test("new cards stay at the preferred position when it is open", () => {
  const position = findOpenCanvasPosition(
    { x: 100, y: 100, width: 250, height: 169 },
    [{ id: "elsewhere", x: 500, y: 500, width: 250, height: 169 }],
    { left: 0, right: 1000, top: 0, bottom: 800 },
  );
  assert.deepEqual(position, { x: 100, y: 100 });
});

test("new cards use the nearest visible opening instead of covering an existing card", () => {
  const position = findOpenCanvasPosition(
    { x: 375, y: 315, width: 250, height: 169 },
    [{ id: "center", x: 375, y: 315, width: 250, height: 169 }],
    { left: 0, right: 1000, top: 0, bottom: 800 },
  );
  assert.deepEqual(position, { x: 665, y: 315 });
});

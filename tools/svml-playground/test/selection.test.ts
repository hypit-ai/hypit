import assert from "node:assert/strict";
import test from "node:test";

import { clipAtOffset, createStore } from "../src/ui/selection.js";
import type { Clip, PlaygroundSnapshot } from "../src/shared.js";

function clip(id: string, start: number, end: number, extra: Partial<Clip> = {}): Clip {
  const box = { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 };
  return {
    id,
    authoredId: id,
    label: id,
    kind: "media",
    startFrame: start,
    endFrameExclusive: end,
    elementRange: { start: 0, end: 10 },
    binding: { kind: "program" },
    frame: box,
    contentFrame: box,
    animated: false,
    placeholder: true,
    stackOrder: 40,
    ...extra,
  };
}

function snapshot(clips: readonly Clip[], frameCount = 200): PlaygroundSnapshot {
  return {
    revision: 1,
    mode: "synthetic",
    source: { path: "main.svml", text: "", digest: "sha256:0" },
    elements: [],
    space: {
      canvasWidth: 1080, canvasHeight: 1920, clearColor: "#000000",
      frameRate: { numerator: 30, denominator: 1 }, frameCount, durationSec: frameCount / 30,
    },
    tracks: [{ id: "broll", label: "broll", kind: "media", row: 0, clips }],
    preview: { kind: "hyperframes", srcdoc: "" },
    refused: [],
    provenance: { timing: "estimated", picture: "estimated", note: "" },
    unsupported: [],
  };
}

test("selecting a clip moves the playhead to its first frame", () => {
  const store = createStore();
  store.load(snapshot([clip("a", 10, 40), clip("b", 60, 90)]));
  store.selectClip("b", "timeline");
  const state = store.current()!;
  assert.equal(state.selection.kind, "clip");
  assert.equal(state.playhead.frame, 60);
});

test("origin is carried through so a pane can ignore its own event", () => {
  const store = createStore();
  store.load(snapshot([clip("a", 10, 40)]));
  store.selectClip("a", "code");
  const state = store.current()!;
  assert.equal(state.selection.kind === "clip" && state.selection.origin, "code");
  // Without this the code pane would scroll itself out from under the author's
  // cursor every time they clicked in it.
  assert.equal(state.playhead.origin, "code");
});

test("the playhead never leaves the program", () => {
  const store = createStore();
  store.load(snapshot([clip("a", 10, 40)], 100));
  store.seek(-50, "timeline");
  assert.equal(store.current()!.playhead.frame, 0);
  store.seek(9999, "timeline");
  assert.equal(store.current()!.playhead.frame, 99);
});

test("a reread that drops the selected clip clears the selection", () => {
  const store = createStore();
  store.load(snapshot([clip("a", 10, 40), clip("b", 60, 90)]));
  store.selectClip("b", "timeline");
  store.load(snapshot([clip("a", 10, 40)]));
  assert.equal(store.current()!.selection.kind, "none");
});

test("a reread that shortens the program pulls the playhead back inside it", () => {
  const store = createStore();
  store.load(snapshot([clip("a", 10, 40)], 200));
  store.seek(180, "timeline");
  store.load(snapshot([clip("a", 10, 40)], 50));
  assert.equal(store.current()!.playhead.frame, 49);
});

test("clips at a frame come back topmost first", () => {
  const store = createStore();
  store.load(snapshot([
    clip("under", 0, 100, { stackOrder: 10 }),
    clip("over", 20, 60, { stackOrder: 90 }),
  ]));
  assert.deepEqual(store.clipsAt(30).map((item) => item.id), ["over", "under"]);
  // endFrameExclusive is exclusive, so the last frame of a clip is end - 1.
  assert.deepEqual(store.clipsAt(60).map((item) => item.id), ["under"]);
  assert.deepEqual(store.clipsAt(100).map((item) => item.id), []);
});

test("a Script marker outranks the element that binds it", () => {
  // The marker sits inside <script>, whose element range also covers the Speech
  // Take. Preferring the marker is what makes clicking the prose select B-roll.
  const value = snapshot([
    clip("take", 0, 200, { elementRange: { start: 0, end: 500 }, bindingRange: { start: 100, end: 400 } }),
    clip("broll", 10, 40, { elementRange: { start: 600, end: 700 }, bindingRange: { start: 150, end: 200 } }),
  ]);
  assert.equal(clipAtOffset(value, 170)?.id, "broll");
  assert.equal(clipAtOffset(value, 300)?.id, "take");
  assert.equal(clipAtOffset(value, 650)?.id, "broll");
  assert.equal(clipAtOffset(value, 900), undefined);
});

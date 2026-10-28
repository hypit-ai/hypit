import assert from "node:assert/strict";
import test from "node:test";

import type { StudioItem, StudioSnapshot } from "../src/shared.js";
import { studioItemAddressKey } from "../src/shared.js";
import { createHtmlPreviewAdapter, type HtmlPreviewWindow } from "../src/ui/html-preview-adapter.js";
import { createStore } from "../src/ui/selection.js";

function adjustmentItem(id: string, adjustmentId = id): StudioItem {
  return {
    id,
    address: { track: { output: "look.visual" }, item: id },
    authoredId: id,
    display: { title: id, layers: [] },
    startFrame: 0,
    endFrameExclusive: 30,
    stackOrder: 0,
    presentation: { kind: "adjustment", chrome: "compact" },
    terminalTargets: [{ kind: "visual-adjustment", occurrencePath: ["picture"], adjustmentId }],
    inspector: [],
    editHandles: [],
  };
}

function snapshot(revision: number, items: readonly StudioItem[]): StudioSnapshot {
  return {
    revision,
    source: { path: "main.svml", text: "", files: [] },
    invocation: { source: "main.svrun", targets: [] },
    canvas: { width: 1920, height: 1080, clearColor: "#000" },
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 30, durationSec: 1 },
    tracks: [{
      address: { output: "look.visual" }, label: "look", row: 0, items, inspectorObjects: [],
      binding: { family: "visual-adjustment", tone: "violet", facet: "visual", group: { kind: "output", output: "look.visual" }, icon: "layers", companion: "track", lane: { heightPx: 32 } },
    }],
    temporalDomains: [],
    preview: { kind: "html-program", srcdoc: "" },
  };
}

test("preview participation is independent item session state and reconciles on recompilation", () => {
  const store = createStore();
  store.load(snapshot(1, [adjustmentItem("grade"), adjustmentItem("blur")]));
  const grade = { track: { output: "look.visual" }, item: "grade" } as const;
  const blur = { track: { output: "look.visual" }, item: "blur" } as const;
  store.setItemPreviewIncluded(grade, false);
  store.setItemPreviewIncluded(blur, false);
  assert.deepEqual([...store.current()!.preview.omittedItemKeys].sort(),
    [studioItemAddressKey(blur), studioItemAddressKey(grade)].sort());

  store.setItemPreviewIncluded(grade, true);
  assert.deepEqual([...store.current()!.preview.omittedItemKeys], [studioItemAddressKey(blur)]);

  store.load(snapshot(2, [adjustmentItem("grade")]));
  assert.deepEqual([...store.current()!.preview.omittedItemKeys], []);
});

test("the HTML adapter derives renderer bypass from the whole item mask and restores authority", () => {
  const calls: unknown[][] = [];
  const target = {
    __hypitSetAdjustmentBypassed: (...args: unknown[]) => { calls.push(args); return true; },
  } as unknown as HtmlPreviewWindow;
  const adapter = createHtmlPreviewAdapter();
  const view = snapshot(1, [adjustmentItem("grade"), adjustmentItem("blur")]);
  adapter.mount(target);
  adapter.apply(view, new Set(view.tracks[0]!.items.map((item) => studioItemAddressKey(item.address))));
  adapter.apply(view, new Set([studioItemAddressKey(view.tracks[0]!.items[1]!.address)]));
  adapter.apply(view, new Set());
  assert.deepEqual(calls, [
    [["picture"], "grade", true],
    [["picture"], "blur", true],
    [["picture"], "grade", false],
    [["picture"], "blur", false],
  ]);
});

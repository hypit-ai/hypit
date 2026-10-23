import assert from "node:assert/strict";
import test from "node:test";

import type { StudioItem, StudioSnapshot } from "../src/shared.js";
import { createHtmlPreviewAdapter, type HtmlPreviewWindow } from "../src/ui/html-preview-adapter.js";
import { createStore } from "../src/ui/selection.js";

function adjustmentItem(id: string, adjustmentId = id): StudioItem {
  return {
    id,
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
    run: { path: "main.svrun", targets: [], satisfactions: [] },
    canvas: { width: 1920, height: 1080, clearColor: "#000" },
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 30, durationSec: 1 },
    tracks: [{
      id: "look.visual", label: "look", row: 0, items, inspectorObjects: [],
      binding: { family: "visual-adjustment", tone: "violet", facet: "visual", groupId: "look", icon: "layers", companion: "track", lane: { heightPx: 32 } },
    }],
    temporalDomains: [],
    preview: { kind: "html-program", srcdoc: "" },
  };
}

test("preview participation is independent item session state and reconciles on recompilation", () => {
  const store = createStore();
  store.load(snapshot(1, [adjustmentItem("grade"), adjustmentItem("blur")]));
  store.setItemPreviewIncluded("grade", false);
  store.setItemPreviewIncluded("blur", false);
  assert.deepEqual([...store.current()!.preview.omittedItemIds].sort(), ["blur", "grade"]);

  store.setItemPreviewIncluded("grade", true);
  assert.deepEqual([...store.current()!.preview.omittedItemIds], ["blur"]);

  store.load(snapshot(2, [adjustmentItem("grade")]));
  assert.deepEqual([...store.current()!.preview.omittedItemIds], []);
});

test("the HTML adapter derives renderer bypass from the whole item mask and restores authority", () => {
  const calls: unknown[][] = [];
  const target = {
    __hypitSetAdjustmentBypassed: (...args: unknown[]) => { calls.push(args); return true; },
  } as unknown as HtmlPreviewWindow;
  const adapter = createHtmlPreviewAdapter();
  const view = snapshot(1, [adjustmentItem("grade"), adjustmentItem("blur")]);
  adapter.mount(target);
  adapter.apply(view, new Set(["grade", "blur"]));
  adapter.apply(view, new Set(["blur"]));
  adapter.apply(view, new Set());
  assert.deepEqual(calls, [
    [["picture"], "grade", true],
    [["picture"], "blur", true],
    [["picture"], "grade", false],
    [["picture"], "blur", false],
  ]);
});

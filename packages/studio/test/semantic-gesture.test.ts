import assert from "node:assert/strict";
import test from "node:test";
import type { StudioEditHandle, StudioSemanticAnchor, StudioTemporalInstantProjection } from "@hypit/studio-adapter";
import { adjustScriptSelection, parseScript } from "@hypit/script";
import { projectProgramInstant } from "@hypit/temporal";
import { parseTemporalInstant } from "@hypit/temporal-markup";
import { chooseSemanticGesture, formatTemporalPointEdit, semanticGestureSpan } from "../src/temporal-edit.js";

const source = '<one><HOST>@proof One two @/proof three.</one>';
const narrative = parseScript("gesture", source);
// Duplicate word/Segment boundaries count as one stop, not additional movement steps.
const frames = [0, 0, 0, 5, 10, 20, 40, 55, 55, 55];
const anchors: readonly StudioSemanticAnchor[] = narrative.semanticIndex.anchors.map((anchor, index) => ({ ...anchor, frame: frames[index]! }));
const selection = narrative.selections[0]!;
const temporalSource = { kind: "selection", id: "proof", narrativeId: "story", spaceId: "film" } as const;
const endpoint = (boundary: "start" | "end", frame: number): StudioTemporalInstantProjection => ({
  kind: "instant", expression: `selection.${boundary}`, reference: `selection.${boundary}`, source: temporalSource, frame,
  authority: { kind: "semantic", source: temporalSource, boundary },
});
const handle: StudioEditHandle = {
  id: "move", operation: "timeline.adjust", gesture: "move", enabled: true,
  semantic: { kind: "selection", id: "proof", narrativeId: "story", startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId },
  temporal: { kind: "window", start: endpoint("start", 0), end: endpoint("end", 20), startFrame: 0, endFrameExclusive: 20 },
};
const choose = (h: StudioEditHandle, from: number, to: number, list = anchors) => chooseSemanticGesture({
  anchors: list, handle: h, pointerStart: from, pointerNow: to, frameCount: 100,
});

test("Selection move advances both ends one stop, changes duration, and writes back through Script", () => {
  const target = choose(handle, 0, 5)!;
  assert.equal(target.kind, "selection");
  if (target.kind !== "selection") return;
  assert.deepEqual(semanticGestureSpan(anchors, handle, target), { startFrame: 5, endFrameExclusive: 40 });
  const rewritten = adjustScriptSelection({ sourceName: "gesture", source, parsed: narrative, adjustment: { id: "proof", ...target } });
  const next = parseScript("gesture", rewritten).selections[0]!;
  assert.equal(next.startAnchorId, target.startAnchorId);
  assert.equal(next.endAnchorId, target.endAnchorId);
  const moved: StudioEditHandle = { ...handle, semantic: { ...handle.semantic!, ...target }, temporal: {
    kind: "window", start: endpoint("start", 5), end: endpoint("end", 40), startFrame: 5, endFrameExclusive: 40,
  } };
  const back = choose(moved, 5, 0)!;
  assert.deepEqual(semanticGestureSpan(anchors, moved, back), { startFrame: 0, endFrameExclusive: 20 });
});

test("coincident anchors preserve the current identity without preferring starts to ends", () => {
  assert.deepEqual(choose(handle, 0, 0), { kind: "selection", startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId });
  const point: StudioEditHandle = { ...handle, temporal: endpoint("end", 20) };
  assert.equal(choose(point, 20, 40)?.kind, "selection");
});

test("a directly selected boundary remains editable even when the raw range reverses in time", () => {
  const overlapping = anchors.map((anchor) => anchor.id === selection.startAnchorId ? { ...anchor, frame: 30 } : anchor);
  const point: StudioEditHandle = { ...handle, temporal: endpoint("start", 30) };
  const unchanged = { kind: "selection", startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId } as const;
  assert.deepEqual(semanticGestureSpan(overlapping, point, unchanged), { startFrame: 30, endFrameExclusive: 31 });
  assert.equal(semanticGestureSpan(overlapping, handle, unchanged), undefined);
  assert.ok(choose(point, 30, 40, overlapping));
});

test("dragging a bound Moment keeps an event-and-duration Window intact", () => {
  const momentSource = { ...temporalSource, kind: "moment", id: "beat" } as const;
  const moment: StudioTemporalInstantProjection = { kind: "instant", frame: 20, expression: "moment.cue", reference: "moment.cue", source: momentSource,
    authority: { kind: "semantic", source: momentSource, boundary: "cue" } };
  const timed: StudioEditHandle = { ...handle, semantic: { kind: "moment", id: "beat", narrativeId: "story", anchorId: selection.endAnchorId }, temporal: {
    kind: "window", start: moment, end: { ...moment, frame: 28, authority: { kind: "parameter", binding: "for", relation: "after-start" } },
    startFrame: 20, endFrameExclusive: 28,
  } };
  const target = choose(timed, 20, 40)!;
  assert.deepEqual(semanticGestureSpan(anchors, timed, target), { startFrame: 40, endFrameExclusive: 48 });
});


test("offset edits cross zero without losing the explicit editable parameter", () => {
  assert.equal(formatTemporalPointEdit("moment.cue", 12, 10), "moment.cue+2f");
  assert.equal(formatTemporalPointEdit("moment.cue", 10, 10), "moment.cue+0f");
  assert.equal(formatTemporalPointEdit("moment.cue", 8, 10), "moment.cue-2f");
  assert.equal(formatTemporalPointEdit("absolute", 8), "8f");
});

test("clock expressions retain units until edited and edited values reproject to the exact frame", () => {
  for (const frameRate of [{ numerator: 30, denominator: 1 }, { numerator: 60, denominator: 1 }, { numerator: 30000, denominator: 1001 }]) {
    const space = { id: "clock", durationSec: 300 * frameRate.denominator / frameRate.numerator, frameRate };
    const locate = (value: string) => projectProgramInstant({
      itemId: "point", subjectId: "point", space,
      projection: parseTemporalInstant(value, "point"), authority: { kind: "parameter", binding: "instant", relation: "direct" },
    }).frame;
    assert.equal(locate("2s"), Math.round(2 * frameRate.numerator / frameRate.denominator));
    assert.equal(locate("60f"), 60);
    const original = locate("1.017s");
    for (const delta of [3, -2, 0]) {
      const desired = original + delta;
      assert.equal(locate(formatTemporalPointEdit("absolute", desired)), desired);
      const base = locate("program.end");
      assert.equal(locate(formatTemporalPointEdit("program.end", desired, base)), desired);
    }
  }
});

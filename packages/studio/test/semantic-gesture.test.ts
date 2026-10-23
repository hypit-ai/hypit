import assert from "node:assert/strict";
import test from "node:test";
import type { StudioEditHandle, StudioTemporalDomainAnchor, StudioTemporalInstantProjection } from "@hypit/studio-companion";
import { adjustScriptSelection, parseScript } from "@hypit/script";
import { projectProgramInstant } from "@hypit/temporal";
import { parseTemporalInstant } from "@hypit/temporal/markup";
import { chooseDomainGesture, domainGestureSpan } from "../src/temporal-edit.js";
import { formatTemporalPointEdit } from "@hypit/temporal/studio";

const source = '<one><HOST>@{proof} One two @{/proof} three.</one>';
const narrative = parseScript("gesture", source);
// Duplicate word/Segment boundaries count as one stop, not additional movement steps.
const frames = [0, 0, 5, 10, 20, 40, 55, 55];
const anchors: readonly StudioTemporalDomainAnchor[] = narrative.anchors.map((anchor, index) => ({ ...anchor, frame: frames[index]! }));
const selection = narrative.selections[0]!;
const narrativeType = { module: { name: "@hypit/narrative", version: "1" }, name: "NarrativeReference" } as const;
const domainIdentity = { companion: "script", id: "story" } as const;
const temporalSource = { scope: "timeline", kind: "selection", id: "proof", narrativeId: "story", timelineId: "film", type: narrativeType, domain: domainIdentity } as const;
const endpoint = (boundary: "start" | "end", frame: number): StudioTemporalInstantProjection => ({
  kind: "instant", expression: `selection.${boundary}`, reference: `selection.${boundary}`, source: temporalSource, frame,
  authority: { kind: "domain", source: temporalSource, boundary },
});
const handle: StudioEditHandle = {
  id: "move", operation: "timeline.adjust", gesture: "move", enabled: true,
  domain: { kind: "span", companion: "script", domainId: "story", itemId: "proof",
    startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId },
  temporal: { kind: "window", start: endpoint("start", 0), end: endpoint("end", 20), startFrame: 0, endFrameExclusive: 20 },
};
const choose = (h: StudioEditHandle, from: number, to: number, list = anchors) => chooseDomainGesture({
  anchors: list, handle: h, pointerStart: from, pointerNow: to, frameCount: 100,
});

test("Selection move requires one exact frame delta at both semantic endpoints", () => {
  const movingAnchors = anchors.filter((anchor, index) =>
    ![0, 20, 40].includes(anchor.frame)
    || (anchor.frame === 0 && anchor.id === selection.startAnchorId)
    || (anchor.frame === 20 && anchor.id === selection.endAnchorId)
    || (anchor.frame === 40 && index === anchors.findIndex((candidate) => candidate.frame === 40)));
  const target = choose(handle, 0, 20, movingAnchors)!;
  assert.equal(target.kind, "span");
  if (target.kind !== "span") return;
  assert.deepEqual(domainGestureSpan(movingAnchors, handle, target), { startFrame: 20, endFrameExclusive: 40 });
  const rewritten = adjustScriptSelection({ sourceName: "gesture", source, parsed: narrative, adjustment: { id: "proof", ...target } });
  const next = parseScript("gesture", rewritten).selections[0]!;
  assert.equal(next.startAnchorId, target.startAnchorId);
  assert.equal(next.endAnchorId, target.endAnchorId);
  const moved: StudioEditHandle = { ...handle, domain: target, temporal: {
    kind: "window", start: endpoint("start", 20), end: endpoint("end", 40), startFrame: 20, endFrameExclusive: 40,
  } };
  const back = choose(moved, 20, 0, movingAnchors)!;
  assert.deepEqual(domainGestureSpan(movingAnchors, moved, back), { startFrame: 0, endFrameExclusive: 20 });
});

test("coincident anchors preserve the current identity without preferring starts to ends", () => {
  assert.deepEqual(choose(handle, 0, 0), { kind: "span", companion: "script", domainId: "story", itemId: "proof",
    startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId });
  const point: StudioEditHandle = { ...handle, temporal: endpoint("end", 20) };
  assert.equal(choose(point, 20, 40)?.kind, "span");
});

test("a drag does not silently choose between distinct identities at a new coincident stop", () => {
  const duplicate = { ...anchors[0]!, id: "another-anchor", frame: 40 };
  const point: StudioEditHandle = { ...handle, temporal: endpoint("end", 20) };
  assert.equal(choose(point, 20, 40, [...anchors, duplicate]), undefined);
});

test("a directly selected boundary remains editable even when the raw range reverses in time", () => {
  const overlapping = anchors.map((anchor) => anchor.id === selection.startAnchorId ? { ...anchor, frame: 30 } : anchor);
  const point: StudioEditHandle = { ...handle, temporal: endpoint("start", 30) };
  const unchanged = { kind: "span", companion: "script", domainId: "story", itemId: "proof",
    startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId } as const;
  assert.deepEqual(domainGestureSpan(overlapping, point, unchanged), { startFrame: 30, endFrameExclusive: 31 });
  assert.equal(domainGestureSpan(overlapping, handle, unchanged), undefined);
  assert.ok(choose(point, 30, 40, overlapping));
});

test("dragging a bound Moment keeps an event-and-duration Window intact", () => {
  const momentSource = { ...temporalSource, kind: "moment", id: "beat" } as const;
  const moment: StudioTemporalInstantProjection = { kind: "instant", frame: 20, expression: "moment.cue", reference: "moment.cue", source: momentSource,
    authority: { kind: "domain", source: momentSource, boundary: "cue" } };
  const timed: StudioEditHandle = { ...handle, domain: { kind: "point", companion: "script", domainId: "story",
    itemId: "beat", anchorId: selection.endAnchorId }, temporal: {
    kind: "window", start: moment, end: { ...moment, frame: 28, authority: { kind: "parameter", binding: "for", relation: "after-start" } },
    startFrame: 20, endFrameExclusive: 28,
  } };
  const target = choose(timed, 20, 40)!;
  assert.deepEqual(domainGestureSpan(anchors, timed, target), { startFrame: 40, endFrameExclusive: 48 });
});

test("trimming a point-anchored Window moves only the selected boundary", () => {
  const momentSource = { ...temporalSource, kind: "moment", id: "beat" } as const;
  const moment: StudioTemporalInstantProjection = { kind: "instant", frame: 20, expression: "moment.cue", reference: "moment.cue", source: momentSource,
    authority: { kind: "domain", source: momentSource, boundary: "cue" } };
  const timed: StudioEditHandle = { ...handle, gesture: "trim-start", domain: { kind: "point", companion: "script", domainId: "story",
    itemId: "beat", anchorId: selection.endAnchorId }, temporal: {
    kind: "window", start: moment, end: { ...moment, frame: 28, authority: { kind: "parameter", binding: "for", relation: "after-start" } },
    startFrame: 20, endFrameExclusive: 28,
  } };
  const target = choose(timed, 20, 5)!;
  assert.deepEqual(domainGestureSpan(anchors, timed, target), { startFrame: 5, endFrameExclusive: 28 });
});


test("offset edits cross zero without losing the explicit editable parameter", () => {
  assert.equal(formatTemporalPointEdit("moment.cue", 12, 10), "moment.cue+2f");
  assert.equal(formatTemporalPointEdit("moment.cue", 10, 10), "moment.cue+0f");
  assert.equal(formatTemporalPointEdit("moment.cue", 8, 10), "moment.cue-2f");
  assert.equal(formatTemporalPointEdit("absolute", 8), "8f");
});

test("clock expressions retain units until edited and edited values reproject to the exact frame", () => {
  for (const frameRate of [{ numerator: 30, denominator: 1 }, { numerator: 60, denominator: 1 }, { numerator: 30000, denominator: 1001 }]) {
    const space = { id: "clock", frameCount: 300, frameRate };
    const locate = (value: string) => projectProgramInstant({
      itemId: "point", subjectId: "point", timeline: { ...space },
      projection: parseTemporalInstant(value, "point") as import("@hypit/temporal").TemporalInstantExpression,
    }).frame;
    assert.equal(locate("2s"), Math.round(2 * frameRate.numerator / frameRate.denominator));
    assert.equal(locate("60f"), 60);
    const original = locate("1.017s");
    for (const delta of [3, -2, 0]) {
      const desired = original + delta;
      assert.equal(locate(formatTemporalPointEdit("absolute", desired)), desired);
      const base = locate("timeline.end");
      assert.equal(locate(formatTemporalPointEdit("timeline.end", desired, base)), desired);
    }
  }
});

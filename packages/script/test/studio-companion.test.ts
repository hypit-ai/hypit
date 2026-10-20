import assert from "node:assert/strict";
import test from "node:test";
import { narrativeTemporalTypes } from "@hypit/narrative-temporal";
import { captionDocument, decodeScriptSurface, parseScript } from "@hypit/script";
import { scriptStudioTemporalDomains } from "@hypit/script/studio";
import type { ScriptStudioObservation } from "@hypit/script/studio";

test("Studio observes and edits the compiler's Script body without changing its prose", () => {
  const companion = scriptStudioTemporalDomains[0]!;
  const body = '<line><host>是的  就是这样。 <진행자>@{beat!}“안녕”{emphasis} 세계. \\<!-- 설명</line>';
  const prefix = '<svml>\r\n<!-- 🎬 -->\r\n<script id="story">';
  const source = `${prefix}${body}</script>\r\n</svml>`;
  const input = { sourceName: "studio.svml", source, tag: "script", attributes: { id: "story" },
    openingStart: source.indexOf("<script"),
    range: { start: source.indexOf("<script"), end: source.length - "\r\n</svml>".length }, contentStart: prefix.length };
  const decoded = decodeScriptSurface(input);
  const observed = companion.observe({ ...input, nextOffset: decoded.nextOffset })!;
  assert.equal(source.slice(observed.content.start, observed.content.end), body);
  const observation = observed.data as ScriptStudioObservation;
  assert.equal(source.slice(observation.moments[0]!.range.start, observation.moments[0]!.range.end), "@{beat!}");

  const parsed = parseScript("body", body);
  const anchorId = parsed.tokens[0]!.startAnchorId;
  const changed = companion.adjust({ sourceName: "body", source: body,
    adjustment: { kind: "point", itemId: "beat", anchorId } });
  const after = parseScript("body", changed);
  assert.equal(after.moments[0]!.anchorId, anchorId);
  assert.equal(changed.replace("@{beat!}", ""), body.replace("@{beat!}", ""));
  assert.equal(after.serializations.speech, parsed.serializations.speech);
  assert.deepEqual(captionDocument(after, "caption", "story"), captionDocument(parsed, "caption", "story"));

  const values = decoded.records.flatMap(record => [{ id: record.id, type: record.type, value: record.value }]);
  values.push({ id: "story.projection", type: narrativeTemporalTypes.narrativeProjection, value: {
    id: "story.projection", narrativeId: "story", timelineId: "film",
    segments: parsed.segments.map((segment) => ({ segmentId: segment.id,
      startBoundaryId: segment.startAnchorId, endBoundaryId: segment.endAnchorId })),
    tokens: parsed.tokens.map((token) => ({ tokenId: token.id, segmentId: token.segmentId, text: token.text,
      startBoundaryId: token.startAnchorId, endBoundaryId: token.endAnchorId })),
    boundaries: parsed.anchors.map((anchor, index) => ({ id: anchor.id, frame: index * 3 })),
  } });
  const [projection] = companion.project({ source: { ...observed, companion: companion.id }, values,
    timeline: { id: "film", frameCount: 100, frameRate: { numerator: 30, denominator: 1 } },
  });
  assert.ok(projection);
  assert.deepEqual(projection.lanes.map((lane) => lane.id), ["maps", "evidence"]);
  assert.deepEqual(projection.lanes.map((lane) => lane.heightPx), [15, 15]);
  assert.equal(projection.items.some((item) => item.laneId === "intent"), false);
  assert.equal(projection.editItems.some((item) => item.id === "beat"), true);
  const tokens = projection.items.filter((item) => item.kind === "span" && item.appearance === "compact");
  assert.deepEqual(tokens.map(token => token.label), parsed.tokens.map(token => token.text));
  assert.deepEqual(tokens.map(token => token.range), observation.tokens.map(token => token.range));
  const frames = new Map(parsed.anchors.map((anchor, index) => [anchor.id, index * 3]));
  assert.deepEqual(tokens.map(token => token.kind === "span" ? [token.startFrame, token.endFrameExclusive] : []),
    parsed.tokens.map(token => [frames.get(token.startAnchorId), frames.get(token.endAnchorId)]));
});

test("Studio projects every exact Narrative Projection instead of choosing one per Script and Timeline", () => {
  const body = '<line><host>one two</line>';
  const prefix = '<script id="story">';
  const source = `${prefix}${body}</script>`;
  const companion = scriptStudioTemporalDomains[0]!;
  const decoded = decodeScriptSurface({ sourceName: "studio.svml", source, tag: "script", attributes: { id: "story" },
    openingStart: 0, contentStart: prefix.length });
  const observed = companion.observe({ sourceName: "studio.svml", source, tag: "script", attributes: { id: "story" },
    range: { start: 0, end: source.length }, contentStart: prefix.length, nextOffset: decoded.nextOffset })!;
  const parsed = parseScript("body", body);
  const values = decoded.records.flatMap(record => [{ id: record.id, type: record.type, value: record.value }]);
  for (const [id, offset] of [["story.primary", 0], ["story.alternate", 40]] as const) {
    values.push({ id, type: narrativeTemporalTypes.narrativeProjection, value: {
      id, narrativeId: "story", timelineId: "film",
      segments: parsed.segments.map((segment) => ({ segmentId: segment.id,
        startBoundaryId: segment.startAnchorId, endBoundaryId: segment.endAnchorId })),
      tokens: parsed.tokens.map((token) => ({ tokenId: token.id, segmentId: token.segmentId, text: token.text,
        startBoundaryId: token.startAnchorId, endBoundaryId: token.endAnchorId })),
      boundaries: parsed.anchors.map((anchor, index) => ({ id: anchor.id, frame: offset + index * 3 })),
    } });
  }
  const projected = companion.project({ source: { ...observed, companion: companion.id }, values,
    timeline: { id: "film", frameCount: 100, frameRate: { numerator: 30, denominator: 1 } } });
  assert.deepEqual(projected.map((item) => item.id), ["story.primary", "story.alternate"]);
  assert.deepEqual(projected.map((item) => item.lanes.map((lane) => lane.id)),
    [["maps", "evidence"], ["maps", "evidence"]]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { mediaLocalTemporalDomain } from "@hypit/media";
import type { Narrative } from "@hypit/narrative";
import { captionUnitsForNarrativeSelection, projectNarrativeCaptionTiming } from "@hypit/narrative-caption";
import { captionDocument, narrativeCaptionBinding, narrativeValue, parseScript } from "@hypit/script";
import { createNarrativeProjection, projectNarrativeAlignment, selectionFrameSpan } from "@hypit/narrative-temporal";
import { alignNarrative } from "@hypit/narrative-speech-alignment";
import type { Timeline } from "@hypit/timeline";
import { interpretWhisperXTranscript } from "@hypit/whisperx";

import { fixtureResource } from "../fixture-resource.js";

test("Caption uses complete Narrative selections and authored Cues", () => {
  const parsed = parseScript("caption.svml", "<line>one @{focus} two three @{/focus} || four</line>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const binding = narrativeCaptionBinding(parsed, "story.caption", "story");
  const selection = narrative.selections[0]!;
  const subset = captionUnitsForNarrativeSelection(document, binding, narrative, selection);
  assert.equal(subset.unitIds.length, 2);
  assert.equal(document.cues.length, 2);
  assert.deepEqual(document.cues.map((cue) => cue.unitIds.length), [3, 1]);
});

test("Caption selects complete Segments and the program through structural anchors", () => {
  const parsed = parseScript("caption-ranges.svml", `@{~whole}
@{opening} <intro><HOST>One idea.</intro> @{/opening}
<answer><GUEST>Another view.</answer>
@{/whole~}`);
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const binding = narrativeCaptionBinding(parsed, "story.caption", "story");
  const whole = narrative.selections.find((selection) => selection.id === "whole")!;
  const opening = narrative.selections.find((selection) => selection.id === "opening")!;
  assert.deepEqual(captionUnitsForNarrativeSelection(document, binding, narrative, whole).unitIds,
    document.units.map((unit) => unit.id));
  assert.deepEqual(captionUnitsForNarrativeSelection(document, binding, narrative, opening).unitIds,
    document.cues[0]!.unitIds);
});

for (const grouped of [false, true]) test(`Chinese Script projects Caption timing through explicit alignments and domain Windows (shared groups: ${grouped})`, () => {
  const parsed = parseScript("mixed-zh.svml", `<opening><HOST>用@{brand} ElevenLabs @{/brand}做${grouped ? '<视频|>' : '视频'}，|| 真方便。</opening>
<answer><GUEST>今年<2026|二零二六>年，這個很好。</answer>`);
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const binding = narrativeCaptionBinding(parsed, "story.caption", "story");
  const phrases = ["用ElevenLabs做视频真方便", "今年二零二六年这个很好"];
  const durations = [4000, 3000];
  const timeline: Timeline = { id: "speech", frameRate: { numerator: 1000, denominator: 1 }, frameCount: 7000 };
  const evidenceWindows: Array<Array<[number, number]>> = [];
  const entries = [] as Parameters<typeof createNarrativeProjection>[3][number][];
  let targetStartFrame = 0;

  for (const [index, segment] of narrative.segments.entries()) {
    let cursor = 100;
    const words = [...phrases[index]!].map((word, characterIndex) => {
      const start = cursor;
      cursor += characterIndex % 3 === 0 ? 190 : 90;
      const end = cursor;
      cursor += characterIndex % 4 === 0 ? 80 : 20;
      return { word, start: start / 1000, end: end / 1000 };
    });
    evidenceWindows.push(words.map((word) => [Math.round(word.start * 1000), Math.round(word.end * 1000)]));
    const frameCount = durations[index]!;
    const sampleFrames = frameCount * 16;
    const media = {
      frameDomain: { frameRate: timeline.frameRate, frameCount },
      audio: { artifact: { kind: "blob" as const, resource: fixtureResource(`zh:${index}`), size: 1, mediaType: "audio/wav" } },
    };
    const domain = mediaLocalTemporalDomain(`zh:${index}:domain`, media);
    const excerpt = { narrativeId: narrative.id, kind: "segment" as const, id: segment.id,
      tokenStart: segment.tokenStart, tokenEndExclusive: segment.tokenEndExclusive };
    const alignment = alignNarrative(narrative, excerpt, domain, {
      domainId: domain.id,
      sampleFrames,
      passages: interpretWhisperXTranscript({ language: "zh", segments: [{ start: 0, end: frameCount / 1000, words }] }, sampleFrames),
    });
    const endFrameExclusive = targetStartFrame + frameCount;
    const window = {
      id: `zh:${index}:window`, subjectId: segment.id,
      start: { id: `zh:${index}:start`, subjectId: segment.id, timelineId: timeline.id, frame: targetStartFrame },
      end: { id: `zh:${index}:end`, subjectId: segment.id, timelineId: timeline.id, frame: endFrameExclusive },
      span: { startFrame: targetStartFrame, endFrameExclusive },
    };
    entries.push(projectNarrativeAlignment(alignment, domain, window, timeline));
    targetStartFrame += frameCount;
  }

  const narrativeProjection = createNarrativeProjection("speech-semantic", narrative.id, timeline, entries);
  const timing = projectNarrativeCaptionTiming(document, binding, narrativeProjection);
  const wordText = new Map(document.words.map((word) => [word.id, word.text]));
  const unitText = new Map(document.units.map((unit) => [unit.id, unit.wordIds.map((id) => wordText.get(id)!).join("")]));
  assert.equal("cues" in timing, false);
  const units = timing.units;
  const windowsFor = (text: string) => units.filter((unit) => unitText.get(unit.unitId) === text)
    .map((unit) => [unit.startFrame, unit.endFrameExclusive]);
  const first = evidenceWindows[0]!;
  assert.deepEqual(windowsFor("用"), [first[0]]);
  assert.deepEqual(windowsFor("ElevenLabs"), [[first[1]![0], first[10]![1]]]);
  assert.deepEqual(windowsFor("做"), [first[11]]);
  if (grouped) assert.deepEqual(windowsFor("视频，"), [[first[12]![0], first[13]![1]]]);
  const alignedFirst = entries[0]!;
  const framesByBoundary = new Map(alignedFirst.boundaries.map((boundary) => [boundary.id, boundary.frame]));
  assert.deepEqual(alignedFirst.tokens.filter((token) => ["做", "视", "频"].includes(token.text))
    .map((token) => [framesByBoundary.get(token.startBoundaryId), framesByBoundary.get(token.endBoundaryId)]), first.slice(11, 14));
  assert.deepEqual(selectionFrameSpan(narrativeProjection, { ...narrative.selections[0]!, narrativeId: narrative.id }),
    { startFrame: first[1]![0], endFrameExclusive: first[10]![1] });
  const second = evidenceWindows[1]!;
  assert.deepEqual(windowsFor("2026"), [[4000 + second[2]![0], 4000 + second[5]![1]]]);
  assert.deepEqual(windowsFor("這"), [[4000 + second[7]![0], 4000 + second[7]![1]]]);
  assert.deepEqual(windowsFor("個"), [[4000 + second[8]![0], 4000 + second[8]![1]]]);
  assert.equal(document.cues[0]!.role, "HOST");
});

test("Caption timing joins named units, preserves overlaps and never repairs projection evidence", () => {
  const document = {
    id: "caption",
    units: [
      { id: "unit-a", wordIds: ["word-a"] },
      { id: "unit-b", wordIds: ["word-b"] },
    ],
    words: [
      { id: "word-a", unitId: "unit-a", text: "A", separatorBefore: "" as const, attributes: [] },
      { id: "word-b", unitId: "unit-b", text: "B", separatorBefore: " " as const, attributes: [] },
    ],
    cues: [{ id: "cue", unitIds: ["unit-a", "unit-b"] }],
  };
  const binding = {
    id: "binding", narrativeId: "story", documentId: document.id,
    // Deliberately reversed: identity, not array position, owns the join.
    units: [
      { unitId: "unit-b", sourceTokenIds: ["token-b"] },
      { unitId: "unit-a", sourceTokenIds: ["token-a"] },
    ],
  };
  const projection = {
    id: "projection", narrativeId: "story", timelineId: "film",
    segments: [{ segmentId: "segment", startBoundaryId: "segment-start", endBoundaryId: "segment-end" }],
    tokens: [
      { tokenId: "token-a", segmentId: "segment", text: "A", startBoundaryId: "a-start", endBoundaryId: "a-end" },
      { tokenId: "token-b", segmentId: "segment", text: "B", startBoundaryId: "b-start", endBoundaryId: "b-end" },
    ],
    boundaries: [
      { id: "segment-start", frame: 0 }, { id: "a-start", frame: 0 },
      { id: "b-start", frame: 5 }, { id: "a-end", frame: 10 },
      { id: "b-end", frame: 15 }, { id: "segment-end", frame: 15 },
    ],
  };
  assert.deepEqual(projectNarrativeCaptionTiming(document, binding, projection).units, [
    { unitId: "unit-a", startFrame: 0, endFrameExclusive: 10 },
    { unitId: "unit-b", startFrame: 5, endFrameExclusive: 15 },
  ]);

  const missingToken = { ...projection, tokens: projection.tokens.slice(0, 1) };
  assert.throws(() => projectNarrativeCaptionTiming(document, binding, missingToken),
    /CaptionDocument caption -> Unit unit-b -> Binding binding -> Token token-b is absent/u);
  const zeroLength = { ...projection, boundaries: projection.boundaries.map((boundary) =>
    boundary.id === "a-end" ? { ...boundary, frame: 0 } : boundary) };
  assert.throws(() => projectNarrativeCaptionTiming(document, binding, zeroLength),
    /Unit unit-a resolves to invalid absolute boundaries 0\.\.0/u);
});

test("an empty CaptionDocument projects to one complete empty timing table", () => {
  assert.deepEqual(projectNarrativeCaptionTiming(
    { id: "empty", units: [], words: [], cues: [] },
    { id: "binding", narrativeId: "story", documentId: "empty", units: [] },
    { id: "projection", narrativeId: "story", timelineId: "film", segments: [], tokens: [], boundaries: [] },
  ), { timelineId: "film", documentId: "empty", units: [] });
});

import assert from "node:assert/strict";
import test from "node:test";

import type { Narrative, NarrativeSelectionRef } from "@hypit/narrative";
import { projectNarrativeCaptionTiming } from "@hypit/narrative-caption";
import { alignNarrative } from "@hypit/narrative-speech-alignment";
import {
  createNarrativeProjection,
  projectNarrativeAlignment,
  projectNarrativeInstant,
} from "@hypit/narrative-temporal";
import {
  captionDocument,
  narrativeCaptionBinding,
  narrativeValue,
  parseScript,
} from "@hypit/script";
import {
  decodeSpeechTranscriptSource,
  speechTranscriptSource,
  type SpeechTranscriptEvidence,
} from "@hypit/speech-evidence";
import { composeTemporalWindow, type LocalTemporalDomain, type TemporalWindow } from "@hypit/temporal";
import type { Timeline } from "@hypit/timeline";

function segmentEvidence(sampleFrames: number, text: string, startSample: number, endSampleExclusive: number): SpeechTranscriptEvidence {
  return {
    sampleFrames,
    passages: [{
      words: [{ text, startSample, endSampleExclusive }],
      chars: [],
    }],
  };
}

function absoluteSelectionWindow(
  projection: ReturnType<typeof createNarrativeProjection>,
  selection: NarrativeSelectionRef,
): TemporalWindow {
  const start = projectNarrativeInstant({
    narrative: projection,
    source: selection,
    sourceKind: "selection",
    spec: { id: `${selection.id}.start`, subjectId: selection.id, boundary: "start" },
  });
  const end = projectNarrativeInstant({
    narrative: projection,
    source: selection,
    sourceKind: "selection",
    spec: { id: `${selection.id}.end`, subjectId: selection.id, boundary: "end" },
  });
  return composeTemporalWindow({ id: selection.id, subjectId: selection.id }, start, end);
}

test("a Selection between two Segments becomes the Window between their independently projected boundaries", () => {
  const parsed = parseScript("bridge.svml", "<one>alpha @{bridge}</one>\n<two>@{/bridge} beta</two>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const timeline: Timeline = { id: "film", frameRate: { numerator: 10, denominator: 1 }, frameCount: 30 };
  const placements = [[0, 10], [20, 30]] as const;
  const parts = narrative.segments.map((segment, index) => {
    const domain: LocalTemporalDomain = {
      id: `domain-${segment.id}`,
      frameRate: timeline.frameRate,
      frameCount: 10,
    };
    const excerpt = {
      narrativeId: narrative.id,
      kind: "segment" as const,
      id: segment.id,
      tokenStart: segment.tokenStart,
      tokenEndExclusive: segment.tokenEndExclusive,
    };
    const alignment = alignNarrative(
      narrative,
      excerpt,
      domain,
      segmentEvidence(16_000, narrative.tokens[segment.tokenStart]!.text, 1_600, 8_000),
    );
    const [startFrame, endFrameExclusive] = placements[index]!;
    const window: TemporalWindow = {
      id: `placement-${segment.id}`,
      subjectId: segment.id,
      start: { id: `placement-${segment.id}.start`, subjectId: segment.id, timelineId: timeline.id, frame: startFrame },
      end: { id: `placement-${segment.id}.end`, subjectId: segment.id, timelineId: timeline.id, frame: endFrameExclusive },
      span: { startFrame, endFrameExclusive },
    };
    return projectNarrativeAlignment(alignment, domain, window, timeline);
  });
  const projection = createNarrativeProjection("story-time", narrative.id, timeline, parts);
  const selection = { ...narrative.selections[0]!, narrativeId: narrative.id };

  assert.deepEqual(
    { startAnchorId: selection.startAnchorId, endAnchorId: selection.endAnchorId },
    { startAnchorId: "segment:one:end", endAnchorId: "segment:two:start" },
  );
  assert.deepEqual(absoluteSelectionWindow(projection, selection).span, {
    startFrame: 10,
    endFrameExclusive: 20,
  });
});

test("editing transcript sample boundaries changes derived absolute timing without changing authored meaning or placement", () => {
  const parsed = parseScript("repair.svml", "<line>hello @{focus}world@{/focus}</line>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const segment = narrative.segments[0]!;
  const selection = { ...narrative.selections[0]!, narrativeId: narrative.id };
  const document = captionDocument(parsed, "story.caption", narrative.id);
  const binding = narrativeCaptionBinding(parsed, document.id, narrative.id);
  const domain: LocalTemporalDomain = {
    id: "performance-domain",
    frameRate: { numerator: 1_000, denominator: 1 },
    frameCount: 2_000,
  };
  const timeline: Timeline = { id: "film", frameRate: domain.frameRate, frameCount: 5_000 };
  const placement: TemporalWindow = {
    id: "performance",
    subjectId: segment.id,
    start: { id: "performance.start", subjectId: segment.id, timelineId: timeline.id, frame: 3_000 },
    end: { id: "performance.end", subjectId: segment.id, timelineId: timeline.id, frame: 5_000 },
    span: { startFrame: 3_000, endFrameExclusive: 5_000 },
  };
  const original = speechTranscriptSource("performance", {
    sampleFrames: 32_000,
    passages: [{
      words: [
        { text: "hello", startSample: 1_600, endSampleExclusive: 6_400 },
        { text: "world", startSample: 8_000, endSampleExclusive: 12_000 },
      ],
      chars: [],
    }],
  });
  const repaired = original
    .replace('"startSample": 8000', '"startSample": 9600')
    .replace('"endSampleExclusive": 12000', '"endSampleExclusive": 14400');
  assert.notEqual(repaired, original);

  const resolve = (source: string) => {
    const evidence = decodeSpeechTranscriptSource(source);
    const alignment = alignNarrative(narrative, {
      narrativeId: narrative.id,
      kind: "segment",
      id: segment.id,
      tokenStart: segment.tokenStart,
      tokenEndExclusive: segment.tokenEndExclusive,
    }, domain, evidence);
    const projection = createNarrativeProjection(
      "story-time",
      narrative.id,
      timeline,
      [projectNarrativeAlignment(alignment, domain, placement, timeline)],
    );
    const timing = projectNarrativeCaptionTiming(document, binding, projection);
    const worldWord = document.words.find((word) => word.text === "world")!;
    const worldUnit = timing.units.find((unit) => unit.unitId === worldWord.unitId)!;
    return { window: absoluteSelectionWindow(projection, selection).span, worldUnit };
  };

  assert.deepEqual(resolve(original), {
    window: { startFrame: 3_500, endFrameExclusive: 3_750 },
    worldUnit: { unitId: document.words.find((word) => word.text === "world")!.unitId,
      startFrame: 3_500, endFrameExclusive: 3_750 },
  });
  assert.deepEqual(resolve(repaired), {
    window: { startFrame: 3_600, endFrameExclusive: 3_900 },
    worldUnit: { unitId: document.words.find((word) => word.text === "world")!.unitId,
      startFrame: 3_600, endFrameExclusive: 3_900 },
  });
});

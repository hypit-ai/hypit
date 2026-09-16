import { mediaTypes, sealSynchronizedMedia } from "@hypit/media";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import type { Narrative } from "@hypit/narrative";
import { sealSpeechEvidenceAudio, speechProducers } from "@hypit/speech";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  decodeWhisperXSemanticTakeSurface,
  isWhisperXLanguage,
  verifyWhisperXAlignmentRequest,
  whisperXLanguages,
  whisperXRequestForEvidenceAudio,
} from "@hypit/whisperx";

function evidenceAudio(): SpeechEvidenceAudio {
  return sealSpeechEvidenceAudio({
    artifact: {
      kind: "blob",
      resource: fixtureResource("whisperx-test:evidence-audio"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    sampleFrames: 16_000,
  });
}

test("WhisperX receives normalized bytes without authored Segment truth", () => {
  const valid = evidenceAudio();
  const request = whisperXRequestForEvidenceAudio(valid, { language: "es" });
  assert.equal(request.audio.resource, valid.artifact.resource);
  assert.equal("segments" in request, false);
  assert.equal(request.sampleFrames, 16_000);
  assert.equal(request.language, "es");
});

test("the real-media Surface materializes an empty Segment from its media domain", async () => {
  const narrative: Narrative = {
    id: "wordless-real",
    caption: { id: "wordless-real.caption", narrativeId: "wordless-real", units: [], words: [], cueBreaks: [] },
    segments: [{
      id: "pause",
      startAnchorId: "pause:start",
      endAnchorId: "pause:end",
      tokenStart: 0,
      tokenEndExclusive: 0,
    }],
    tokens: [], turns: [], selections: [], moments: [],
    semanticIndex: { anchors: [
      { id: "pause:start", kind: "segment-start", segmentId: "pause" },
      { id: "pause:end", kind: "segment-end", segmentId: "pause" },
    ] },
  };
  const excerpt = {
    narrativeId: narrative.id,
    kind: "segment" as const,
    id: "pause",
    tokenStart: 0,
    tokenEndExclusive: 0,
  };
  const media = sealSynchronizedMedia({
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 90 },
    visual: {
      artifact: { kind: "blob", resource: fixtureResource("whisperx:wordless"), size: 1, mediaType: "video/mp4" },
      width: 1_080,
      height: 1_920,
    },
  });
  const authored = (
    path: string,
    type: SurfaceResolvedReference["type"],
    value: unknown,
  ): SurfaceResolvedReference => ({
    path,
    ref: { kind: "record", id: path },
    type,
    record: { id: path, type, value: { kind: "inline", value: value as never } },
  });
  const refs = new Map<string, SurfaceResolvedReference>([
    ["story", authored("story", narrativeTypes.narrative, narrative)],
    ["story.segment.pause", authored("story.segment.pause", narrativeTypes.excerpt, excerpt)],
    ["pause-media.media", authored("pause-media.media", mediaTypes.synchronized, media)],
  ]);
  const output = await decodeWhisperXSemanticTakeSurface({
    sourceName: "real.svml",
    element: parseStructuredElement({ name: "real.svml", text:
      '<whisperx:SemanticTake id="pause" narrative={story} segment={story.segment.pause} media={pause-media.media}/>',
    }, 0).element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("No assets are resolved by this test."); },
  });

  assert.equal(output.records.length, 0);
  assert.equal(output.fragments[0]?.operations[0]?.producer.name, speechProducers.materializeSegmentBoundaries.name);
  assert.deepEqual(Object.keys(output.components[0]?.inputs ?? {}).sort(), ["media", "narrative", "segment"]);
});

test("the language union mirrors WhisperX's alignment model table and stays fail-closed", () => {
  assert.equal(whisperXLanguages.length, 40);
  assert.deepEqual([...whisperXLanguages], [...whisperXLanguages].sort());
  assert.equal(new Set(whisperXLanguages).size, whisperXLanguages.length);
  for (const language of ["en", "zh", "es", "ko", "ja", "de"]) assert.equal(isWhisperXLanguage(language), true);
  // `id` is aligned by whisperx 3.8.6 but not by the 3.8.5 the hosted route runs, so it stays out until both agree.
  for (const value of ["", "EN", "auto", "kr", "id", "zh-CN", undefined, 1]) assert.equal(isWhisperXLanguage(value), false);
  assert.throws(
    () => verifyWhisperXAlignmentRequest({ ...whisperXRequestForEvidenceAudio(evidenceAudio(), { language: "ko" }), language: "kr" }),
    /WhisperX alignment request is invalid/,
  );
  assert.equal(verifyWhisperXAlignmentRequest(whisperXRequestForEvidenceAudio(evidenceAudio(), { language: "ko" })).language, "ko");
});

test("the real-media Surface accepts every alignable language and rejects the rest by name", async () => {
  const narrative: Narrative = {
    id: "spoken",
    caption: { id: "spoken.caption", narrativeId: "spoken", units: [], words: [], cueBreaks: [] },
    segments: [{
      id: "line",
      startAnchorId: "line:start",
      endAnchorId: "line:end",
      tokenStart: 0,
      tokenEndExclusive: 1,
    }],
    tokens: [], turns: [], selections: [], moments: [],
    semanticIndex: { anchors: [
      { id: "line:start", kind: "segment-start", segmentId: "line" },
      { id: "line:end", kind: "segment-end", segmentId: "line" },
    ] },
  };
  const excerpt = { narrativeId: narrative.id, kind: "segment" as const, id: "line", tokenStart: 0, tokenEndExclusive: 1 };
  const media = sealSynchronizedMedia({
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 90 },
    visual: {
      artifact: { kind: "blob", resource: fixtureResource("whisperx:spoken"), size: 1, mediaType: "video/mp4" },
      width: 1_080,
      height: 1_920,
    },
  });
  const authored = (path: string, type: SurfaceResolvedReference["type"], value: unknown): SurfaceResolvedReference => ({
    path,
    ref: { kind: "record", id: path },
    type,
    record: { id: path, type, value: { kind: "inline", value: value as never } },
  });
  const refs = new Map<string, SurfaceResolvedReference>([
    ["story", authored("story", narrativeTypes.narrative, narrative)],
    ["story.segment.line", authored("story.segment.line", narrativeTypes.excerpt, excerpt)],
    ["line-media.media", authored("line-media.media", mediaTypes.synchronized, media)],
  ]);
  const decode = (language: string) => decodeWhisperXSemanticTakeSurface({
    sourceName: "real.svml",
    element: parseStructuredElement({ name: "real.svml", text:
      `<whisperx:SemanticTake id="line" narrative={story} segment={story.segment.line} media={line-media.media} language="${language}"/>`,
    }, 0).element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("No assets are resolved by this test."); },
  });

  for (const language of whisperXLanguages) {
    const output = await decode(language);
    assert.deepEqual(output.records[0]?.value, { kind: "inline", value: language });
    assert.equal(output.components[0]?.inputs.language?.kind, "record");
  }
  await assert.rejects(async () => decode("kr"), /language must be a WhisperX alignment language: ar, ca, .*, ko, .*, zh$/);
});

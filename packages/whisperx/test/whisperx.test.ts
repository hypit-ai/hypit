import { mediaTypes, sealSynchronizedMedia } from "@hypit/media";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { narrativeTypes } from "@hypit/narrative";
import type { Narrative } from "@hypit/narrative";
import { narrativeTemporalProducers } from "@hypit/narrative-temporal";
import { sealSpeechEvidenceAudio } from "@hypit/speech-evidence";
import type { SpeechEvidenceAudio } from "@hypit/speech-evidence";
import { temporalTypes } from "@hypit/temporal";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  decodeWhisperXAlignmentSurface,
  whisperXRequestForEvidenceAudio,
  whisperXComponent,
  verifyWhisperXAlignmentRequest,
  parseWhisperXLanguage,
} from "@hypit/whisperx";

function evidenceAudio(): SpeechEvidenceAudio {
  return sealSpeechEvidenceAudio({
    domainId: "speech-domain",
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
  assert.equal(request.domainId, valid.domainId);
  assert.equal("segments" in request, false);
  assert.equal(request.sampleFrames, 16_000);
  assert.equal(request.language, "es");
});

test("SVML language reaches the alignment request without a service-support table", async () => {
  const refs = new Map<string, SurfaceResolvedReference>([
    ["story", { path: "story", ref: { kind: "record", id: "story" }, type: narrativeTypes.narrative }],
    ["excerpt", { path: "excerpt", ref: { kind: "record", id: "excerpt" }, type: narrativeTypes.segmentRef }],
    ["media", { path: "media", ref: { kind: "record", id: "media" }, type: mediaTypes.synchronized }],
    ["domain", { path: "domain", ref: { kind: "record", id: "domain" }, type: temporalTypes.localDomain }],
  ]);
  // "zzz" deliberately tests expression independently of a deployment's supported languages.
  for (const language of ["en", "zh", "es", "ko", "ja", "id", "yue", "zzz"]) {
    const output = await decodeWhisperXAlignmentSurface({
      sourceName: "speech.svml",
      element: parseStructuredElement({ name: "speech.svml", text:
        `<whisperx:Alignment id="speech" narrative={story} segment={excerpt} media={media} domain={domain} language="${language}"/>`,
      }, 0).element,
      resolveReference: (path) => refs.get(path),
      resolveAsset: () => { throw new Error("No assets expected"); },
    });
    const result = await whisperXComponent.producers[0]!.handler({ inputs: {
      evidence: { value: (evidenceAudio()) },
      language: { value: output.records.find((record) => record.type.name === "WhisperXLanguage")!.value },
    } } as never);
    assert.equal(result.kind, "need");
    assert.equal(verifyWhisperXAlignmentRequest(result.constraints).language, language);
  }
});

test("language spelling is explicit; auto-detection and locale aliases are not guessed", () => {
  for (const language of [undefined, "", "auto", "und", "KO", "zh-CN", "korean", " ko ", 42]) {
    assert.throws(() => parseWhisperXLanguage(language), /explicit lowercase/u);
    assert.throws(() => verifyWhisperXAlignmentRequest({
      ...whisperXRequestForEvidenceAudio(evidenceAudio(), { language: "en" }), language,
    }), /explicit lowercase/u);
  }
});

test("the real-media Surface materializes an empty Segment from its media domain", async () => {
  const narrative: Narrative = {
    id: "wordless-real",
    segments: [{
      id: "pause",
      startAnchorId: "pause:start",
      endAnchorId: "pause:end",
      tokenStart: 0,
      tokenEndExclusive: 0,
    }],
    tokens: [], turns: [], selections: [], moments: [],
    anchors: [
      { id: "pause:start", kind: "segment-start", segmentId: "pause" },
      { id: "pause:end", kind: "segment-end", segmentId: "pause" },
    ],
  };
  const excerpt = {
    narrativeId: narrative.id,
    kind: "segment" as const,
    id: "pause",
    tokenStart: 0,
    tokenEndExclusive: 0,
  };
  const media = sealSynchronizedMedia({
    frameDomain: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 90 },
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
    record: { id: path, type, value: (value as never) },
  });
  const refs = new Map<string, SurfaceResolvedReference>([
    ["story", authored("story", narrativeTypes.narrative, narrative)],
    ["story.segment.pause", authored("story.segment.pause", narrativeTypes.segmentRef, excerpt)],
    ["pause-media.domain", authored("pause-media.domain", temporalTypes.localDomain, {
      id: "pause-media", frameRate: media.frameDomain.frameRate, frameCount: media.frameDomain.frameCount,
    })],
  ]);
  const output = await decodeWhisperXAlignmentSurface({
    sourceName: "real.svml",
    element: parseStructuredElement({ name: "real.svml", text:
      '<whisperx:Alignment id="pause" narrative={story} segment={story.segment.pause} domain={pause-media.domain}/>',
    }, 0).element,
    resolveReference: (path) => refs.get(path),
    resolveAsset: () => { throw new Error("No assets are resolved by this test."); },
  });

  assert.equal(output.records.length, 0);
  assert.equal(output.components[0]?.fragment.operations[0]?.producer.name, narrativeTemporalProducers.materializeSegmentBoundaries.name);
  assert.deepEqual(Object.keys(output.components[0]?.inputs ?? {}).sort(), ["domain", "narrative", "segment"]);
  assert.deepEqual(output.components[0]?.outputs, { alignment: "pause.alignment" });
});

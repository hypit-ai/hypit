import assert from "node:assert/strict";
import test from "node:test";

import {
  captionComponent,
  captionManifest,
  defaultCaptionTrackProgram,
  planCaptionPresentation,
  renderCaptionTrack,
  sealCaptionTrackProgram,
  temporalizeCaption,
} from "@svml/caption";
import {
  sealAlignedTranscriptEvidence,
  sealProgramSpace,
  sealSpeechBasis,
} from "@svml/contracts";
import type { AlignedTranscriptSegment, Narrative, SpeechAudioBasis } from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import { parseScript } from "@svml/script";
import { locateSpeechTiming } from "@svml/speech-align";

test("the component enumerates every Manifest Producer and owned Type validator", () => {
  assert.deepEqual(
    captionComponent.producers.map((facet) => ({
      name: facet.producer.name,
      digest: facet.implementationDigest,
    })),
    captionManifest.producers.map((producer) => ({
      name: producer.name,
      digest: producer.implementation.digest,
    })),
  );
  assert.deepEqual(
    captionComponent.validators?.map((facet) => ({
      name: facet.type.name,
      digest: facet.implementationDigest,
    })),
    captionManifest.types.map((type) => ({
      name: type.name,
      digest: type.validator?.implementation.digest,
    })),
  );
});

function locate(narrative: Narrative, durationSec: number, segments: readonly AlignedTranscriptSegment[]) {
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec,
    frameRate: { numerator: 1_000, denominator: 1 },
  });
  const audioDigest = digestOf(`caption:audio:${narrative.semanticIndex.digest}`);
  const basisSegments = narrative.segments.map((segment, index) => ({
    segmentId: segment.id,
    startSec: segments[index]!.startSec,
    endSec: segments[index]!.endSec,
  }));
  const basis = sealSpeechBasis({
    contract: "svml.speech-basis@1",
    programSpace,
    audio: { digest: audioDigest, size: 1, mediaType: "audio/wav", durationSec },
    visualTrack: { clips: basisSegments.map((segment) => ({
      segmentId: segment.segmentId,
      artifact: {
        digest: digestOf(`caption:clip:${segment.segmentId}`),
        size: 1,
        mediaType: "video/mp4",
        durationSec: segment.endSec - segment.startSec,
      },
      startSec: segment.startSec,
      endSec: segment.endSec,
    })) },
    segments: basisSegments,
  });
  const evidence = sealAlignedTranscriptEvidence({
    contract: "svml.aligned-transcript-evidence@1",
    audioArtifactDigest: digestOf("caption:acoustic-evidence"),
    programSpaceDigest: basis.programSpace.digest,
    durationSec,
    segments,
  });
  const audioBasis: SpeechAudioBasis = {
    contract: "svml.speech-audio-basis@1",
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
  return locateSpeechTiming(narrative, audioBasis, evidence);
}

test("Caption-owned validators reject digest-preserving shape tampering", () => {
  const narrative = parseScript("validator.svml", "<line>Hello.</line>");
  const projection = temporalizeCaption(narrative, locate(narrative, 1, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0.1, endSec: 0.6 }],
    chars: [],
  }]));
  const program = defaultCaptionTrackProgram("validator-caption");
  const projectionValidator = captionComponent.validators?.find((facet) =>
    facet.type.name === "TimedCaptionProjection");
  const programValidator = captionComponent.validators?.find((facet) =>
    facet.type.name === "CaptionTrackProgram");
  assert(projectionValidator);
  assert(programValidator);
  assert.throws(
    () => projectionValidator.handler({
      type: projectionValidator.type,
      value: { kind: "inline", value: { ...projection, text: "tampered" } },
    }),
    /digest does not match/u,
  );
  assert.throws(
    () => programValidator.handler({
      type: programValidator.type,
      value: { kind: "inline", value: { ...program, id: "tampered" } },
    }),
    /digest does not match/u,
  );
});

test("Caption temporalization preserves evidence envelopes and labels local estimates", () => {
  const narrative = parseScript(
    "caption.svml",
    "<line><that was insane | what the fuck> <15% off | fifteen percent off></line>",
  );
  const map = locate(narrative, 2, [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 2,
      words: [
        { text: "what", startSec: 0.1, endSec: 0.25 },
        { text: "the", startSec: 0.3, endSec: 0.42 },
        { text: "fuck", startSec: 0.48, endSec: 0.72 },
        { text: "fifteen", startSec: 0.9, endSec: 1.15 },
        { text: "percent", startSec: 1.2, endSec: 1.42 },
        { text: "off", startSec: 1.48, endSec: 1.65 },
      ],
      chars: [],
    }]);
  const originalMap = structuredClone(map);
  const timed = temporalizeCaption(narrative, map);

  assert.equal(timed.regions[0]?.display, "that was insane");
  assert.deepEqual(
    [timed.regions[0]?.startSec, timed.regions[0]?.endSec, timed.regions[0]?.refinements.length],
    [0.1, 0.72, 0],
  );
  assert.deepEqual(timed.regions[1]?.refinements.map((item) => item.display), ["off"]);

  const whole = planCaptionPresentation(timed, "whole");
  assert.deepEqual(
    [whole.units[0]?.display, whole.units[0]?.startSec, whole.units[0]?.endSec, whole.units[0]?.basis],
    ["that was insane", 0.1, 0.72, "region-envelope"],
  );

  const words = planCaptionPresentation(timed, "proportional-word");
  assert.deepEqual(words.units.slice(0, 3).map((unit) => unit.basis), [
    "presentation-estimate",
    "presentation-estimate",
    "presentation-estimate",
  ]);
  assert.equal(words.units.find((unit) => unit.display === "off")?.basis, "exact-correspondence");
  assert.equal(words.units.find((unit) => unit.display === "15")?.timingQuality, "estimated");
  assert.deepEqual(map, originalMap, "caption presentation must not modify the global speech map");
});

test("hidden speech owns time but emits no visible presentation unit", () => {
  const narrative = parseScript("hidden.svml", "<line>Hello < | um> world.</line>");
  const map = locate(narrative, 1, [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 1,
      words: [
        { text: "Hello", startSec: 0.1, endSec: 0.25 },
        { text: "um", startSec: 0.3, endSec: 0.4 },
        { text: "world", startSec: 0.45, endSec: 0.7 },
      ],
      chars: [],
    }]);
  const timed = temporalizeCaption(narrative, map);
  const hidden = timed.regions.find((region) => region.kind === "hidden");
  assert.deepEqual([hidden?.startSec, hidden?.endSec], [0.3, 0.4]);
  assert.equal(planCaptionPresentation(timed).units.some((unit) => unit.regionId === hidden?.id), false);
});

test("official caption styling lowers to an ordinary self-contained VisualTrack", () => {
  const narrative = parseScript("track.svml", "<line>Hello world.</line>");
  const map = locate(narrative, 1, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 1,
    words: [
      { text: "Hello", startSec: 0.1, endSec: 0.35 },
      { text: "world", startSec: 0.4, endSec: 0.75 },
    ],
    chars: [],
  }]);
  const projection = temporalizeCaption(narrative, map);
  const program = defaultCaptionTrackProgram("primary-caption");
  const track = renderCaptionTrack(projection, program);

  assert.equal(track.contract, "svml.visual-track@1");
  assert.equal(track.programSpaceDigest, map.programSpace.digest);
  assert.equal(track.presents[0]?.elements.some((element) => element.kind === "text"), true);
  assert.equal(
    track.presents.flatMap((present) => present.elements).some((element) => "text" in element && element.text.includes("Hello")),
    true,
  );
});

test("two caption styles become two peer Tracks without mutating one another", () => {
  const narrative = parseScript("two-tracks.svml", "<line>Hello world.</line>");
  const projection = temporalizeCaption(narrative, locate(narrative, 1, [{
    sourceSegmentId: "line",
    startSec: 0,
    endSec: 1,
    words: [{ text: "Hello", startSec: 0.1, endSec: 0.35 }, { text: "world", startSec: 0.4, endSec: 0.75 }],
    chars: [],
  }]));
  const first = defaultCaptionTrackProgram("speaker-a");
  const second = sealCaptionTrackProgram({
    ...first,
    id: "speaker-b",
    stacking: { order: 101, tieBreak: "speaker-b" },
    style: { ...first.style, color: "#00ff00", bottomPercent: 20 },
  });
  const firstTrack = renderCaptionTrack(projection, first);
  const secondTrack = renderCaptionTrack(projection, second);

  assert.notEqual(firstTrack.digest, secondTrack.digest);
  assert.deepEqual(
    firstTrack.presents.map((present) => present.span),
    secondTrack.presents.map((present) => present.span),
  );
  assert.equal(firstTrack.presents[0]?.stacking.order, 100);
  assert.equal(secondTrack.presents[0]?.stacking.order, 101);
});

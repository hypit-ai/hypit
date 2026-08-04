import assert from "node:assert/strict";
import test from "node:test";

import { sealProgramSpace, sealSpeechBasis } from "@svml/contracts";
import type { SpeechAudioBasis, SpeechBasis } from "@svml/contracts";
import { digestOf } from "@svml/core";
import {
  normalizeWhisperXAlignment,
  sealWhisperXAlignmentEvidence,
  whisperXRequestForAudioBasis,
} from "@svml/whisperx";

function basis() {
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const visual = digestOf("whisperx-test:visual");
  return sealSpeechBasis({
    contract: "svml.speech-basis@1",
    narrativeDigest: digestOf("whisperx-test:narrative"),
    programSpace,
    audio: { digest: digestOf("whisperx-test:audio"), size: 1, mediaType: "audio/wav", durationSec: 1 },
    visualTrack: { clips: [{
      segmentId: "line",
      artifact: { digest: visual, size: 1, mediaType: "video/mp4", durationSec: 1 },
      startSec: 0,
      endSec: 1,
    }] },
    segments: [{ segmentId: "line", startSec: 0, endSec: 1, sourceArtifactDigest: visual }],
  });
}

function audioProjection(basis: SpeechBasis): SpeechAudioBasis {
  return {
    contract: "svml.speech-audio-basis@1",
    basisDigest: basis.basisDigest,
    narrativeDigest: basis.narrativeDigest,
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
}

test("WhisperX consumes only the validated audio projection of a SpeechBasis", () => {
  const valid = audioProjection(basis());
  assert.equal(whisperXRequestForAudioBasis(valid).basisDigest, valid.basisDigest);
  const tampered = { ...valid, audio: { ...valid.audio, durationSec: 2 } };
  assert.throws(() => whisperXRequestForAudioBasis(tampered), /SpeechAudioBasis audio/u);
});

test("WhisperX normalization verifies its model-specific result before lowering to common Evidence", () => {
  const source = basis();
  const measured = sealWhisperXAlignmentEvidence({
    contract: "svml.whisperx-alignment-evidence@1",
    engine: "whisperx",
    basisDigest: source.basisDigest,
    audioArtifactDigest: source.audio.digest,
    programSpaceDigest: source.programSpace.digest,
    rawEvidenceArtifactDigest: digestOf("whisperx-test:raw"),
    durationSec: 1,
    segments: [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 1,
      words: [{ text: "hello", startSec: 0.1, endSec: 0.4 }],
      chars: [],
    }],
  });
  const normalized = normalizeWhisperXAlignment(measured);
  assert.equal(normalized.contract, "svml.aligned-transcript-evidence@1");
  assert.equal(normalized.basisDigest, source.basisDigest);
  assert.throws(
    () => normalizeWhisperXAlignment({
      ...measured,
      segments: [{ ...measured.segments[0]!, words: [{ text: "tampered", startSec: 0.1, endSec: 0.4 }] }],
    }),
    /alignment digest/u,
  );
});

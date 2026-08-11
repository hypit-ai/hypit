import assert from "node:assert/strict";
import test from "node:test";

import type { SynchronizedMedia, TimelineAudio } from "@narratage/media";
import type { NarrativeExcerpt } from "@narratage/narrative";
import { digestOf } from "@narratage/protocol";
import {
  appendSpeechSpineAudioTake,
  appendSpeechSpineVisualTake,
  assembleSpeechBasis,
  createSpeechSpineSet,
  sealSpeechSpineProgram,
  sealSpeechSpineVisualSpec,
} from "@narratage/speech-spine";

const frame = { contract: "svml.spatial-frame@1" as const, xPx: 40, yPx: 80, widthPx: 640, heightPx: 900 };
const fit = {
  contract: "svml.content-fit@1" as const,
  sizing: "cover" as const,
  framePoint: { x: 0.5, y: 0.5 },
  contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 },
  constraint: "bounded" as const,
};

function segment(id: string, index: number): NarrativeExcerpt {
  return { contract: "svml.narrative-excerpt@1", kind: "segment", id, tokenStart: index, tokenEndExclusive: index + 1 };
}

function synchronized(id: string, visual: boolean): SynchronizedMedia {
  return {
    contract: "svml.synchronized-media@1",
    timeline: {
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
    },
    ...(visual ? { visual: {
      artifact: { kind: "blob" as const, digest: digestOf(`${id}:video`), size: 1, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    } } : {}),
    audio: {
      artifact: { kind: "blob", digest: digestOf(`${id}:audio`), size: 1, mediaType: "audio/wav" },
    },
  };
}

test("audio Takes lengthen the speech program without inventing a visual clip", () => {
  const program = sealSpeechSpineProgram({
    contract: "svml.speech-spine-program@1",
    id: "speech",
    frameRate: { numerator: 30, denominator: 1 },
  });
  let set = createSpeechSpineSet();
  set = appendSpeechSpineAudioTake(set, program, synchronized("voice", false), segment("voiceover", 0));
  set = appendSpeechSpineVisualTake(
    set,
    program,
    synchronized("presenter", true),
    segment("answer", 1),
    frame,
    fit,
    sealSpeechSpineVisualSpec({ contract: "svml.speech-spine-visual-spec@1", stackingOrder: 30 }),
  );
  const audio: TimelineAudio = {
    contract: "svml.timeline-audio@1",
    artifact: { kind: "blob", digest: digestOf("speech:mix"), size: 1, mediaType: "audio/wav" },
    codec: "pcm_s16le",
    sampleRate: 48_000,
    channels: 2,
    sampleFrames: 96_000,
    loudness: "planned",
  };
  const basis = assembleSpeechBasis(program, set, audio);
  assert.deepEqual(basis.segments.map((item) => item.segmentId), ["voiceover", "answer"]);
  assert.equal(basis.programSpace.durationSec, 2);
  assert.equal(basis.visualTrack.clips.length, 1);
  assert.deepEqual(basis.visualTrack.clips[0], {
    segmentId: "answer",
    span: { startFrame: 30, endFrameExclusive: 60 },
    artifact: synchronized("presenter", true).visual!.artifact,
    extent: { contract: "svml.intrinsic-extent@1", widthPx: 720, heightPx: 1280 },
    frameRate: { numerator: 30, denominator: 1 },
    frameCount: 30,
    frame,
    fit,
    stackingOrder: 30,
  });
});

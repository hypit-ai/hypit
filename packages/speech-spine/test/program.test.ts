import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import type { SynchronizedMedia, TimelineAudio } from "@narratage/media";
import type { NarrativeExcerpt } from "@narratage/narrative";
import {
  appendSpeechSpineAudioTake,
  appendSpeechSpineVisualTake,
  assembleSpeechBasis,
  createSpeechSpineSet,
  sealSpeechSpineProgram,
  sealSpeechSpineVisualSpec,
} from "@narratage/speech-spine";

const frame = { xPx: 40, yPx: 80, widthPx: 640, heightPx: 900 };
const fit = {
  sizing: "cover" as const,
  framePoint: { x: 0.5, y: 0.5 },
  contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 },
  constraint: "bounded" as const,
};

function segment(id: string, index: number): NarrativeExcerpt {
  return { kind: "segment", id, tokenStart: index, tokenEndExclusive: index + 1 };
}

function synchronized(id: string, visual: boolean): SynchronizedMedia {
  return {
    timeline: {
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 30,
    },
    ...(visual ? { visual: {
      artifact: { kind: "blob" as const, digest: fixtureDigest(`${id}:video`), size: 1, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    } } : {}),
    audio: {
      artifact: { kind: "blob", digest: fixtureDigest(`${id}:audio`), size: 1, mediaType: "audio/wav" },
    },
  };
}

test("audio Takes lengthen the speech program without inventing a visual clip", () => {
  const program = sealSpeechSpineProgram({

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
    sealSpeechSpineVisualSpec({ stackingOrder: 30 }),
  );
  const audio: TimelineAudio = {
    artifact: { kind: "blob", digest: fixtureDigest("speech:mix"), size: 1, mediaType: "audio/wav" },
    sampleFrames: 96_000,
  };
  const basis = assembleSpeechBasis(program, set, audio);
  assert.deepEqual(basis.segments.map((item) => item.segmentId), ["voiceover", "answer"]);
  assert.equal(basis.programSpace.durationSec, 2);
  assert.equal(basis.visualTrack.clips.length, 1);
  assert.deepEqual(basis.visualTrack.clips[0], {
    segmentId: "answer",
    artifact: synchronized("presenter", true).visual!.artifact,
    extent: { widthPx: 720, heightPx: 1280 },
    frame,
    fit,
    stackingOrder: 30,
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import type { SynchronizedMedia, TimelineAudio } from "@hypit/media";
import type { SemanticTake } from "@hypit/speech";
import {
  appendSpeechSpineAudioTake,
  appendSpeechSpineVisualTake,
  assembleSpeechBasis,
  createSpeechSpineSet,
  sealSpeechSpineProgram,
  sealSpeechSpineVisualSpec,
} from "@hypit/speech-spine";

const frame = { xPx: 40, yPx: 80, widthPx: 640, heightPx: 900 };
const fit = {
  sizing: "cover" as const,
  framePoint: { x: 0.5, y: 0.5 },
  contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 },
  constraint: "bounded" as const,
};

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

function semantic(id: string, visual: boolean): SemanticTake {
  const media = synchronized(id, visual);
  return {
    media,
    segment: {
      segmentId: id,
      startAnchorId: `segment:${id}:start`,
      endAnchorId: `segment:${id}:end`,
      startFrame: 0,
      endFrameExclusive: media.timeline.frameCount,
    },
    tokens: [{
      tokenId: `segment:${id}:token:1`,
      segmentId: id,
      text: id,
      startAnchorId: `segment:${id}:token:1:start`,
      endAnchorId: `segment:${id}:token:1:end`,
      startFrame: 0,
      endFrameExclusive: media.timeline.frameCount,
    }],
    anchors: [
      { identity: `segment:${id}:start`, frame: 0 },
      { identity: `segment:${id}:end`, frame: media.timeline.frameCount },
      { identity: `segment:${id}:token:1:start`, frame: 0 },
      { identity: `segment:${id}:token:1:end`, frame: media.timeline.frameCount },
    ],
  };
}

test("audio Takes lengthen the speech program without inventing a visual clip", () => {
  const program = sealSpeechSpineProgram({

    id: "speech",
    frameRate: { numerator: 30, denominator: 1 },
  });
  let set = createSpeechSpineSet();
  set = appendSpeechSpineAudioTake(set, program, semantic("voiceover", false));
  set = appendSpeechSpineVisualTake(
    set,
    program,
    semantic("answer", true),
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
    artifact: synchronized("answer", true).visual!.artifact,
    extent: { widthPx: 720, heightPx: 1280 },
    frame,
    fit,
    stackingOrder: 30,
  });
});

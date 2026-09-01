import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import type { SynchronizedMedia } from "@hypit/media";
import type { SemanticTake } from "@hypit/speech";
import {
  appendSpeechTrackTake,
  assembleSpeechTrack,
  createSpeechTrackSet,
  projectSpeechTrackVisual,
  sealSpeechTrackHeader,
  sealSpeechTrackVisualSpec,
} from "@hypit/speech-track";

const frame = { xPx: 40, yPx: 80, widthPx: 640, heightPx: 900 };
const fit = {
  sizing: "cover" as const,
  framePoint: { x: 0.5, y: 0.5 },
  contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 },
  constraint: "bounded" as const,
};

function semantic(id: string, visual: boolean): SemanticTake {
  const media: SynchronizedMedia = {
    timeline: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 30 },
    ...(visual ? { visual: {
      artifact: { kind: "blob", resource: fixtureResource(`${id}:video`), size: 1, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    } } : {}),
    audio: { artifact: { kind: "blob", resource: fixtureResource(`${id}:audio`), size: 1, mediaType: "audio/wav" } },
  };
  return {
    narrativeId: "test-narrative",
    media,
    segment: {
      segmentId: id,
      startAnchorId: `segment:${id}:start`,
      endAnchorId: `segment:${id}:end`,
      startFrame: 0,
      endFrameExclusive: 30,
    },
    tokens: [],
    anchors: [
      { identity: `segment:${id}:start`, frame: 0 },
      { identity: `segment:${id}:end`, frame: 30 },
    ],
  };
}

test("one Track assembles a continuous SemanticTrack and only visual Takes become presents", () => {
  const header = sealSpeechTrackHeader({ id: "speech" });
  const visualSpec = sealSpeechTrackVisualSpec({ stackingOrder: 30 });
  let set = createSpeechTrackSet();
  set = appendSpeechTrackTake(set, semantic("voiceover", false), frame, fit, visualSpec);
  set = appendSpeechTrackTake(set, semantic("answer", true), frame, fit, visualSpec);

  const semanticTrack = assembleSpeechTrack(header, set);
  const visualTrack = projectSpeechTrackVisual(semanticTrack, set);

  assert.deepEqual(semanticTrack.items.map((item) => item.take.segment.segmentId), ["voiceover", "answer"]);
  assert.equal(visualTrack.presents.length, 1);
  assert.equal(visualTrack.presents[0]?.id, "speech:visual:answer");
  assert.deepEqual(visualTrack.presents[0]?.span, { startFrame: 30, endFrameExclusive: 60 });
});

import { projectSemanticAudioTrack, projectSemanticMedia } from "@hypit/semantic-track";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import type { SynchronizedMedia } from "@hypit/media";
import type { SemanticTake } from "@hypit/speech";
import {
  appendSpeechTrackTake,
  assembleSpeechTrack,
  createSpeechTrackSet,
  sealSpeechTrackHeader,
} from "@hypit/speech-track";

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

test("semantic assembly retains audio and material timing without requiring placement", () => {
  const track = assembleSpeechTrack(sealSpeechTrackHeader({ id: "speech" }),
    appendSpeechTrackTake(appendSpeechTrackTake(createSpeechTrackSet(), semantic("voiceover", false)), semantic("answer", true)));
  assert.deepEqual(track.items.map(item => item.take.segment.segmentId), ["voiceover", "answer"]);
  const audio = projectSemanticAudioTrack(track);
  assert.deepEqual(audio.clips.map(clip => clip.target), [
    { startSample: 0, endSampleExclusive: 48000 }, { startSample: 48000, endSampleExclusive: 96000 },
  ]);
  const selected = projectSemanticMedia(track, { startFrame: 20, endFrameExclusive: 45 });
  assert.deepEqual(selected.map(({ span, source }) => ({ span, source })), [
    { span: { startFrame: 20, endFrameExclusive: 30 }, source: { startFrame: 20, endFrameExclusive: 30 } },
    { span: { startFrame: 30, endFrameExclusive: 45 }, source: { startFrame: 0, endFrameExclusive: 15 } },
  ]);
  assert.equal(selected[0]!.media.visual, undefined);
  assert.equal(selected[1]!.media.visual?.artifact.resource, fixtureResource("answer:video"));
});

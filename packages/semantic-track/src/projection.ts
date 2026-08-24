import { sealAudioTrack } from "@hypit/composition";
import type { AudioTrack } from "@hypit/composition";
import { synchronizedMediaSampleFrames } from "@hypit/media";
import {
  programFrameSampleBoundary,
  sealProgramSpace,
} from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";

import { assertSemanticTrackIdentity, semanticTrackFrameCount, semanticTrackSpans } from "./identity.js";
import type { SemanticTrack } from "./types.js";

export function projectSemanticProgramSpace(track: SemanticTrack): ProgramSpace {
  assertSemanticTrackIdentity(track);
  const frameRate = track.items[0]!.take.media.timeline.frameRate;
  return sealProgramSpace({
    durationSec: semanticTrackFrameCount(track) * frameRate.denominator / frameRate.numerator,
    frameRate,
  });
}

export function projectSemanticAudioTrack(track: SemanticTrack): AudioTrack {
  const space = projectSemanticProgramSpace(track);
  const clips = semanticTrackSpans(track).flatMap(({ item, startFrame, endFrameExclusive }) => {
    const audio = item.take.media.audio;
    if (audio === undefined) return [];
    const sourceSampleFrames = synchronizedMediaSampleFrames(item.take.media);
    const targetStartSample = programFrameSampleBoundary(space, startFrame, 48_000);
    const targetEndSampleExclusive = programFrameSampleBoundary(space, endFrameExclusive, 48_000);
    return [{
      id: item.take.segment.segmentId,
      subjectId: item.take.segment.segmentId,
      artifact: audio.artifact,
      target: { startSample: targetStartSample, endSampleExclusive: targetEndSampleExclusive },
      source: {
        sampleFrames: sourceSampleFrames,
        startSample: 0,
        endSampleExclusive: sourceSampleFrames,
        loop: false,
        phaseSample: 0,
      },
      playbackRate: 1,
      pitch: "preserve" as const,
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    }];
  });
  return sealAudioTrack({ id: `${track.id}:audio`, clips });
}

import { programSpaceSampleFrames } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertSpeechBasisIdentity } from "@narratage/speech";
import type { SpeechAudioBasis, SpeechBasis } from "@narratage/speech";
import { lowerRestrictedSpeechVisualPresents } from "@narratage/media-track";
import { sealAudioTrack, sealVisualTrack } from "@narratage/composition";
import type { AudioTrack, VisualTrack } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";

export const projectSpeechAudioImplementationDigest = digestOf(
  "@narratage/speech-basis/project-audio@1",
);

export const projectSpeechVisualImplementationDigest = digestOf(
  "@narratage/speech-basis/project-visual@1",
);

export const projectSpeechAudioTrackImplementationDigest = digestOf(
  "@narratage/speech-basis/project-audio-track@1",
);

export const projectSpeechProgramSpaceImplementationDigest = digestOf(
  "@narratage/speech-basis/project-program-space@1",
);

export function projectSpeechProgramSpace(basis: SpeechBasis): ProgramSpace {
  assertSpeechBasisIdentity(basis);
  return basis.programSpace;
}

export function projectSpeechAudio(basis: SpeechBasis): SpeechAudioBasis {
  assertSpeechBasisIdentity(basis);
  return {
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
}

export function projectSpeechVisual(basis: SpeechBasis): VisualTrack {
  assertSpeechBasisIdentity(basis);
  const trackId = `speech-visual:${basis.segments.map((segment) => segment.segmentId).join("+")}`;
  const frameAt = (seconds: number): number => Math.round(
    seconds * basis.programSpace.frameRate.numerator / basis.programSpace.frameRate.denominator,
  );
  const spans = new Map(basis.segments.map((segment) => [segment.segmentId, {
    startFrame: frameAt(segment.startSec),
    endFrameExclusive: frameAt(segment.endSec),
  }]));
  return sealVisualTrack({
    visualIr: "svml.visual-ir@1",
    id: trackId,
    presents: lowerRestrictedSpeechVisualPresents(
      trackId,
      basis.programSpace,
      basis.visualTrack.clips.map((clip) => {
        const span = spans.get(clip.segmentId)!;
        return {
          id: clip.segmentId,
          span,
          artifact: clip.artifact,
          extent: clip.extent,
          frameRate: basis.programSpace.frameRate,
          frameCount: span.endFrameExclusive - span.startFrame,
          frame: clip.frame,
          fit: clip.fit,
          stackingOrder: clip.stackingOrder,
        };
      }),
    ),
  });
}

export function projectSpeechAudioTrack(basis: SpeechBasis): AudioTrack {
  assertSpeechBasisIdentity(basis);
  const sampleFrames = programSpaceSampleFrames(basis.programSpace, 48_000);
  return sealAudioTrack({
    id: `speech-audio:${basis.segments.map((segment) => segment.segmentId).join("+")}`,
    clips: [{
      id: "speech",
      artifact: basis.audio,
      target: { startSample: 0, endSampleExclusive: sampleFrames },
      source: {
        sampleFrames,
        startSample: 0,
        endSampleExclusive: sampleFrames,
        loop: false,
        phaseSample: 0,
      },
      playbackRate: 1,
      pitch: "preserve",
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    }],
  });
}

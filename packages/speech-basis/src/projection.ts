import { programSpaceFrameCount, programSpaceSampleFrames } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertSpeechBasisIdentity } from "@narratage/speech";
import type { SpeechAudioBasis, SpeechBasis } from "@narratage/speech";
import { lowerRestrictedSpeechVisualPresents } from "@narratage/media-track";
import { sealAudioTrack, sealVisualTrack } from "@narratage/composition";
import type { AudioTrack, VisualTrack } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";
import type { CanvasSpace } from "@narratage/spatial";

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
    contract: "svml.speech-audio-basis@1",
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
}

function frameAt(basis: SpeechBasis, seconds: number): number {
  return Math.round(seconds * basis.programSpace.frameRate.numerator / basis.programSpace.frameRate.denominator);
}

export function projectSpeechVisual(basis: SpeechBasis, canvas: CanvasSpace): VisualTrack {
  assertSpeechBasisIdentity(basis);
  const trackId = `speech-visual:${basis.segments.map((segment) => segment.segmentId).join("+")}`;
  const segments = new Map(basis.segments.map((segment) => [segment.segmentId, segment]));
  return sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: trackId,
    presents: lowerRestrictedSpeechVisualPresents(
      trackId,
      basis.programSpace,
      canvas,
      basis.visualTrack.clips.map((clip) => {
        const segment = segments.get(clip.segmentId)!;
        return {
          id: clip.segmentId,
          span: { startFrame: frameAt(basis, segment.startSec), endFrameExclusive: frameAt(basis, segment.endSec) },
          artifact: clip.artifact,
          extent: clip.extent,
          frameRate: clip.frameRate,
          frameCount: clip.frameCount,
        };
      }),
      {
        contract: "svml.content-fit@1",
        sizing: "cover",
        framePoint: { x: 0.5, y: 0.5 },
        contentPoint: { x: 0.5, y: 0.5 },
        offsetPx: { x: 0, y: 0 },
        constraint: "bounded",
      },
    ),
  });
}

export function projectSpeechAudioTrack(basis: SpeechBasis): AudioTrack {
  assertSpeechBasisIdentity(basis);
  const sampleFrames = programSpaceSampleFrames(basis.programSpace, 48_000);
  return sealAudioTrack({
    contract: "svml.audio-track@1",
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

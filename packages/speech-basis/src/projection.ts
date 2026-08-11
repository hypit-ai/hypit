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
    contract: "svml.speech-audio-basis@1",
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
}

export function projectSpeechVisual(basis: SpeechBasis): VisualTrack {
  assertSpeechBasisIdentity(basis);
  const trackId = `speech-visual:${basis.segments.map((segment) => segment.segmentId).join("+")}`;
  return sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: trackId,
    presents: lowerRestrictedSpeechVisualPresents(
      trackId,
      basis.programSpace,
      basis.visualTrack.clips.map((clip) => ({
        id: clip.segmentId,
        span: structuredClone(clip.span),
        artifact: clip.artifact,
        extent: clip.extent,
        frameRate: clip.frameRate,
        frameCount: clip.frameCount,
        frame: clip.frame,
        fit: clip.fit,
        stackingOrder: clip.stackingOrder,
      })),
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

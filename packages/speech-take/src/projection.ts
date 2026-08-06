import {
  assertSpeechBasisIdentity,
  programSpaceFrameCount,
  sealAudioTrack,
  sealVisualTrack,
} from "@svml/contracts";
import type {
  AudioTrack,
  ProgramSpace,
  SpeechAudioBasis,
  SpeechBasis,
  VisualElement,
  VisualTrack,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";

export const projectSpeechAudioImplementationDigest = digestOf(
  "@svml/speech-take/project-audio@1",
);

export const projectSpeechVisualImplementationDigest = digestOf(
  "@svml/speech-take/project-visual@2",
);

export const projectSpeechAudioTrackImplementationDigest = digestOf(
  "@svml/speech-take/project-audio-track@1",
);

export const projectSpeechProgramSpaceImplementationDigest = digestOf(
  "@svml/speech-take/project-program-space@1",
);

export function projectSpeechProgramSpace(basis: SpeechBasis): ProgramSpace {
  assertSpeechBasisIdentity(basis);
  return basis.programSpace;
}

export function projectSpeechAudio(basis: SpeechBasis): SpeechAudioBasis {
  assertSpeechBasisIdentity(basis);
  return {
    contract: "svml.speech-audio-basis@1",
    basisDigest: basis.basisDigest,
    narrativeDigest: basis.narrativeDigest,
    programSpace: basis.programSpace,
    audio: basis.audio,
    segments: basis.segments,
  };
}

function frameAt(basis: SpeechBasis, seconds: number): number {
  return Math.round(seconds * basis.programSpace.frameRate.numerator / basis.programSpace.frameRate.denominator);
}

export function projectSpeechVisual(basis: SpeechBasis): VisualTrack {
  assertSpeechBasisIdentity(basis);
  const totalFrames = programSpaceFrameCount(basis.programSpace);
  return sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: `speech-visual:${basis.basisDigest}`,
    programSpaceDigest: basis.programSpace.digest,
    sources: [
      { name: "basis", digest: basis.basisDigest },
      { name: "narrative", digest: basis.narrativeDigest },
    ],
    presents: basis.visualTrack.clips.map((clip, index) => {
      const startFrame = frameAt(basis, clip.startSec);
      const endFrameExclusive = Math.min(totalFrames, frameAt(basis, clip.endSec));
      const kind: VisualElement["kind"] = clip.artifact.mediaType.startsWith("image/") ? "image" : "video";
      if (kind !== "image" && !clip.artifact.mediaType.startsWith("video/")) {
        throw new Error(`Speech visual ${clip.segmentId} is not an image or video Artifact.`);
      }
      if (endFrameExclusive <= startFrame) throw new Error(`Speech visual ${clip.segmentId} has an empty frame span.`);
      return {
        id: `${clip.segmentId}:${index + 1}`,
        span: { startFrame, endFrameExclusive },
        stacking: { order: 0, tieBreak: `speech-visual:${basis.basisDigest}:${clip.segmentId}:${index + 1}` },
        elements: [{
          id: "media",
          order: 0,
          kind,
          artifact: clip.artifact,
          style: [
            { name: "height", value: "100%" },
            { name: "object-fit", value: "cover" },
            { name: "position", value: "absolute" },
            { name: "width", value: "100%" },
          ],
          ...(kind === "video" ? { muted: true } : {}),
        }],
      };
    }),
  });
}

export function projectSpeechAudioTrack(basis: SpeechBasis): AudioTrack {
  assertSpeechBasisIdentity(basis);
  return sealAudioTrack({
    contract: "svml.audio-track@1",
    id: `speech-audio:${basis.basisDigest}`,
    programSpaceDigest: basis.programSpace.digest,
    sources: [
      { name: "basis", digest: basis.basisDigest },
      { name: "narrative", digest: basis.narrativeDigest },
    ],
    clips: [{
      id: "speech",
      span: { startFrame: 0, endFrameExclusive: programSpaceFrameCount(basis.programSpace) },
      artifact: basis.audio,
      bus: "speech",
    }],
  });
}

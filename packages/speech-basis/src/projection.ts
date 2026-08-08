import { programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import { assertSpeechBasisIdentity } from "@narratage/speech";
import type { SpeechAudioBasis, SpeechBasis } from "@narratage/speech";
import { sealAudioTrack, sealVisualTrack } from "@narratage/composition";
import type { AudioTrack, VisualElement, VisualTrack } from "@narratage/composition";
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

function frameAt(basis: SpeechBasis, seconds: number): number {
  return Math.round(seconds * basis.programSpace.frameRate.numerator / basis.programSpace.frameRate.denominator);
}

export function projectSpeechVisual(basis: SpeechBasis): VisualTrack {
  assertSpeechBasisIdentity(basis);
  const totalFrames = programSpaceFrameCount(basis.programSpace);
  const trackId = `speech-visual:${basis.segments.map((segment) => segment.segmentId).join("+")}`;
  return sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.visual-ir@1",
    id: trackId,
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
        stacking: { order: 0, tieBreak: `${trackId}:${clip.segmentId}:${index + 1}` },
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
    id: `speech-audio:${basis.segments.map((segment) => segment.segmentId).join("+")}`,
    clips: [{
      id: "speech",
      span: { startFrame: 0, endFrameExclusive: programSpaceFrameCount(basis.programSpace) },
      artifact: basis.audio,
      bus: "speech",
    }],
  });
}

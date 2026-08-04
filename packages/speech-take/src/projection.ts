import { assertSpeechBasisIdentity } from "@svml/contracts";
import type {
  SpeechAudioBasis,
  SpeechBasis,
  SpeechVisualTrack,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";

export const projectSpeechAudioImplementationDigest = digestOf(
  "@svml/speech-take/project-audio@1",
);

export const projectSpeechVisualImplementationDigest = digestOf(
  "@svml/speech-take/project-visual@1",
);

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

export function projectSpeechVisual(basis: SpeechBasis): SpeechVisualTrack {
  assertSpeechBasisIdentity(basis);
  return {
    contract: "svml.speech-visual-track@1",
    basisDigest: basis.basisDigest,
    narrativeDigest: basis.narrativeDigest,
    programSpace: basis.programSpace,
    visualTrack: basis.visualTrack,
    segments: basis.segments,
  };
}

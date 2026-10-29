import { audioProgramSourceClips, verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram } from "@hypit/audio-program";
import { readAudioGainProcess } from "@hypit/composition";
import { readPreservePitch } from "@hypit/audio-stretch";
import type { EndpointSupport } from "@hypit/hypit/endpoint";
import type { CanonicalValue } from "@hypit/hypit/protocol";
import { verifyPreparedAudioSource } from "@hypit/media";
import {
  assertTemporalMap,
  isAffineTemporalMapPiece,
} from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";
import { planPositiveAffineReconstruction } from "./audio-render.js";

function unsupported(reason: string): EndpointSupport {
  return { status: "unsupported", reason };
}

/** Request-local capability decision owned by this local signal renderer. */
export function supportsLocalAudioProgram(constraints: CanonicalValue): EndpointSupport {
  const program = (constraints as { readonly program?: unknown }).program;
  try {
    verifyAudioProgram(program);
  } catch (error) {
    return unsupported(`Invalid AudioProgram: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const inspect = (value: AudioProgram): void => {
      for (const node of value.graph.nodes) {
        if (node.kind === "process") {
          if (Object.keys(node.inputs).some((port) => port !== "signal")) {
            throw new Error(`Audio Process ${node.id} has unsupported ports.`);
          }
          readAudioGainProcess(node.program);
        }
        if (node.kind === "composition") {
          if (node.reconstruction !== undefined) {
            throw new Error(`Audio Composition ${node.id} reconstruction is unsupported.`);
          }
          inspect(node.program);
        }
      }
    };
    inspect(program as AudioProgram);
  } catch (error) {
    return unsupported(`Audio Process is unsupported: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const clip of audioProgramSourceClips(program as AudioProgram)) {
    if (clip.reconstruction === undefined) continue;
    try {
      readPreservePitch(clip.reconstruction);
      planPositiveAffineReconstruction(clip);
    } catch (error) {
      return unsupported(`Audio Clip ${clip.id} reconstruction is unsupported: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { status: "supported" };
}

/** Speech projection has its own signal boundary even when it consumes the same Prepared Media map. */
export function supportsLocalSpeechEvidenceAudio(constraints: CanonicalValue): EndpointSupport {
  const request = constraints as { readonly source?: unknown; readonly preparation?: unknown };
  const source = request.source;
  const preparation = request.preparation as TemporalMap;
  try {
    verifyPreparedAudioSource(source);
    assertTemporalMap(preparation);
  } catch (error) {
    return unsupported(`Invalid speech-evidence audio request: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (preparation.stages.at(-1)!.source.id !== source.sourceDomain.id) {
    return unsupported("Speech-evidence preparation does not end at its selected audio source.");
  }
  if (preparation.stages.some((stage) =>
    stage.pieces.some((piece) => !isAffineTemporalMapPiece(piece)
      || piece.wrap !== undefined || piece.rate.numerator <= 0))) {
    return unsupported("Speech-evidence audio requires positive affine, non-looping Prepared Media relations.");
  }
  return { status: "supported" };
}

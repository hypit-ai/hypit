import { isPointwiseOperatorTemporalSupport, verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram } from "@hypit/audio-program";
import { readAudioGainProgram } from "@hypit/audio-gain";
import { readPreservePitch } from "@hypit/audio-preserve-pitch";
import type { EndpointSupport } from "@hypit/hypit/endpoint";
import type { CanonicalValue } from "@hypit/hypit/protocol";
import { verifyPreparedAudioSource } from "@hypit/media";
import {
  assertTemporalMap,
  compareExactTemporalValues,
  isAffineTemporalMapPiece,
} from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";
import { planDirectProgrammeReconstruction } from "./audio-render.js";

function unsupported(reason: string): EndpointSupport {
  return { status: "unsupported", reason };
}

function assertSupportedAudioProgram(program: AudioProgram): void {
  if (program.sampling.sampleRate !== 48_000) {
    throw new Error(`sample rate ${program.sampling.sampleRate} is unsupported.`);
  }
  for (const node of program.graph.nodes) {
    if (node.kind === "program") {
      if (node.reconstruction !== undefined) {
        readPreservePitch(node.reconstruction);
        planDirectProgrammeReconstruction(node, program.sampling);
      }
      assertSupportedAudioProgram(node.program);
      continue;
    }
    if (node.kind !== "process") continue;
    if (!isPointwiseOperatorTemporalSupport(node.temporalSupport)) {
      throw new Error(`Audio Process ${node.id} requires non-pointwise temporal support.`);
    }
    if (Object.keys(node.inputs).some((port) => port !== "signal")) {
      throw new Error(`Audio Process ${node.id} has unsupported ports.`);
    }
    const gain = readAudioGainProgram(node.program);
    if (gain.kind === "constant") {
      if (Object.keys(node.controlMappings).length !== 0) {
        throw new Error(`Audio Gain Process ${node.id} constant gain has Control mappings.`);
      }
      continue;
    }
    if (Object.keys(node.controlMappings).join("\u0000") !== "gain") {
      throw new Error(`Audio Gain Process ${node.id} requires exactly one gain Control mapping.`);
    }
    const source = node.controlMappings.gain!.stages.at(-1)!.source;
    if (source.id !== gain.control.domain.id
      || compareExactTemporalValues(source.duration, gain.control.domain.duration) !== 0) {
      throw new Error(`Audio Gain Process ${node.id} Control mapping does not end in ${gain.control.domain.id}.`);
    }
  }
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
    assertSupportedAudioProgram(program as AudioProgram);
  } catch (error) {
    return unsupported(`AudioProgram capability is unsupported: ${error instanceof Error ? error.message : String(error)}`);
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

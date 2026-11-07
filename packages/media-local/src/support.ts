import { isPointwiseOperatorTemporalSupport, verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram } from "@hypit/audio-program";
import { readAudioGainProgram } from "@hypit/audio-gain";
import { readPreservePitch } from "@hypit/audio-preserve-pitch";
import { verifyPreparedAudioSource } from "@hypit/media";
import {
  assertTemporalMap,
  compareExactTemporalValues,
  isAffineTemporalMapPiece,
} from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";
import { planDirectProgrammeReconstruction } from "./audio-render.js";

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

/** Validate the exact AudioProgram subset implemented by this local signal renderer. */
export function assertLocalAudioProgramSupported(program: unknown): asserts program is AudioProgram {
  try {
    verifyAudioProgram(program);
  } catch (error) {
    throw new Error(`Invalid AudioProgram: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    assertSupportedAudioProgram(program);
  } catch (error) {
    throw new Error(`AudioProgram capability is unsupported: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Validate the narrower signal boundary implemented by local speech projection. */
export function assertLocalSpeechEvidenceAudioSupported(
  source: unknown,
  preparation: unknown,
): void {
  const map = preparation as TemporalMap;
  try {
    verifyPreparedAudioSource(source);
    assertTemporalMap(map);
  } catch (error) {
    throw new Error(`Invalid speech-evidence audio request: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (map.stages.at(-1)!.source.id !== source.sourceDomain.id) {
    throw new Error("Speech-evidence preparation does not end at its selected audio source.");
  }
  if (map.stages.some((stage) =>
    stage.pieces.some((piece) => !isAffineTemporalMapPiece(piece)
      || piece.wrap !== undefined || piece.rate.numerator <= 0))) {
    throw new Error("Speech-evidence audio requires positive affine, non-looping Prepared Media relations.");
  }
}

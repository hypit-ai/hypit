import type { EndpointSupport } from "@hypit/hypit/endpoint";
import type { CanonicalValue } from "@hypit/hypit/value";
import { assertLocalAudioProgramSupported } from "@hypit/media-local";
import { verifyPreparedAudioSource } from "@hypit/media";
import { assertTemporalMap, isAffineTemporalMapPiece } from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";

function unsupported(reason: string): EndpointSupport {
  return { status: "unsupported", reason };
}

/** Map the direct renderer's supported AudioProgram subset into Endpoint support. */
export function supportsLocalAudioProgram(constraints: CanonicalValue): EndpointSupport {
  const program = (constraints as { readonly program?: unknown }).program;
  try {
    assertLocalAudioProgramSupported(program);
  } catch (error) {
    return unsupported(error instanceof Error ? error.message : String(error));
  }
  return { status: "supported" };
}

/** Map the direct speech projection boundary into Endpoint support. */
export function supportsLocalSpeechEvidenceAudio(constraints: CanonicalValue): EndpointSupport {
  const request = constraints as { readonly source?: unknown; readonly preparation?: unknown };
  try {
    verifyPreparedAudioSource(request.source);
    assertTemporalMap(request.preparation as TemporalMap);
    const map = request.preparation as TemporalMap;
    if (map.stages.at(-1)!.source.id !== request.source.sourceDomain.id) {
      throw new Error("Speech-evidence preparation does not end at its selected audio source.");
    }
    if (map.stages.some((stage) =>
      stage.pieces.some((piece) => !isAffineTemporalMapPiece(piece)
        || piece.wrap !== undefined || piece.rate.numerator <= 0))) {
      throw new Error("Speech-evidence audio requires positive affine, non-looping Prepared Media relations.");
    }
  } catch (error) {
    return unsupported(error instanceof Error ? error.message : String(error));
  }
  return { status: "supported" };
}

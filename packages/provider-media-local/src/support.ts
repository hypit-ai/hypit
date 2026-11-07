import type { EndpointSupport } from "@hypit/hypit/endpoint";
import type { CanonicalValue } from "@hypit/hypit/protocol";
import {
  assertLocalAudioProgramSupported,
  assertLocalSpeechEvidenceAudioSupported,
} from "@hypit/media-local";

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
    assertLocalSpeechEvidenceAudioSupported(request.source, request.preparation);
  } catch (error) {
    return unsupported(error instanceof Error ? error.message : String(error));
  }
  return { status: "supported" };
}

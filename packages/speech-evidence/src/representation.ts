import type { MediaRepresentationPackage } from "@hypit/media-asset";
import { compareExactTemporalValues } from "@hypit/temporal";

import { speechEvidenceTypes } from "./contract.js";
import { decodeSpeechTranscriptSource } from "./transcript-document.js";

/**
 * Open one file-backed acoustic observation attached to a Media Asset.
 *
 * The Representation relation supplies the media identity and the exact map.
 * Evidence itself remains provider-neutral and does not repeat either fact.
 */
export const speechEvidenceMediaRepresentationPackage: MediaRepresentationPackage = {
  representations: [{
    type: speechEvidenceTypes.transcript,
    async open({ representation, read }) {
      if (representation.binding.audio === undefined
        || representation.binding.temporal === undefined) {
        throw new Error("SpeechTranscriptEvidence Representation requires temporal and audio media bindings.");
      }
      const evidence = decodeSpeechTranscriptSource(
        new TextDecoder().decode(await read(representation.document)),
        `SpeechTranscriptEvidence Representation ${representation.id}`,
      );
      const target = representation.binding.temporal.mapToMedia.stages[0]!.target;
      const evidenceDuration = {
        ticks: String(evidence.sampleFrames),
        timeBase: { numerator: 1, denominator: 16_000 },
      } as const;
      if (compareExactTemporalValues(target.duration, evidenceDuration) !== 0) {
        throw new Error(
          `SpeechTranscriptEvidence Representation ${representation.id} sample span differs from its temporal binding.`,
        );
      }
      return evidence;
    },
  }],
};

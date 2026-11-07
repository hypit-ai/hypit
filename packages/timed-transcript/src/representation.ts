import type { MediaRepresentationPackage } from "@hypit/media-asset";

import { timedTranscriptTypes } from "./contract.js";
import { decodeTimedTranscript } from "./document.js";

export const timedTranscriptMediaRepresentationPackage: MediaRepresentationPackage = {
  representations: [{
    type: timedTranscriptTypes.transcript,
    async open({ representation, read }) {
      if (representation.binding.audio === undefined || representation.binding.temporal === undefined) {
        throw new Error("TimedTranscript Representation requires temporal and audio media bindings.");
      }
      return decodeTimedTranscript(
        new TextDecoder().decode(await read(representation.document)),
        `TimedTranscript Representation ${representation.id}`,
      );
    },
  }],
};

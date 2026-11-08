import type { MediaRepresentationPackage } from "@hypit/media-asset";
import { compareExactTemporalValues } from "@hypit/temporal/algebra";

import { objectTrackTypes } from "./contract.js";
import { parseObjectTrackDocument } from "./document.js";

export const objectTrackMediaRepresentationPackage: MediaRepresentationPackage = {
  representations: [{
    type: objectTrackTypes.document,
    async open({ representation, read }) {
      if (representation.binding.picture === undefined || representation.binding.temporal === undefined) {
        throw new Error("ObjectTrack Representation requires temporal and picture media bindings.");
      }
      const document = parseObjectTrackDocument(
        new TextDecoder().decode(await read(representation.document)),
      );
      const target = representation.binding.temporal.mapToMedia.stages[0]!.target;
      if (target.id !== document.domain.id
        || compareExactTemporalValues(target.duration, document.domain.duration) !== 0) {
        throw new Error(`ObjectTrack Representation ${representation.id} domain does not match its temporal binding.`);
      }
      return document;
    },
  }],
};

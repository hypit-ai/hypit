import { createMediaRepresentationFacet } from "@hypit/media-asset";
import { createProductExporterFacet } from "@hypit/hypit/product";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { timedTranscriptComponent } from "./component.js";
import { timedTranscriptManifest, timedTranscriptTypes } from "./contract.js";
import { encodeTimedTranscript } from "./document.js";
import type { TimedTranscript } from "./document.js";
import { timedTranscriptMediaRepresentationPackage } from "./representation.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: timedTranscriptManifest }],
  facets: [
    createRefinementPackageFacet(timedTranscriptComponent.refinements ?? []),
    createProductExporterFacet({
      type: timedTranscriptTypes.transcript,
      export({ value }) { return { bytes: new TextEncoder().encode(encodeTimedTranscript(value as unknown as TimedTranscript)) }; },
    }),
    createMediaRepresentationFacet(timedTranscriptMediaRepresentationPackage),
  ],
};
export default hypitPackage;

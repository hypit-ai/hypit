import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createMediaRepresentationFacet } from "@hypit/media-asset";
import { createProductExporterFacet } from "@hypit/hypit/generation/product";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";

import { timedTranscriptComponent } from "./component.js";
import { timedTranscriptManifest, timedTranscriptTypes } from "./contract.js";
import { encodeTimedTranscript } from "./document.js";
import type { TimedTranscript } from "./document.js";
import { timedTranscriptMediaRepresentationPackage } from "./representation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(timedTranscriptManifest), createGenerationModuleFacet(timedTranscriptManifest),
    createRefinementPackageFacet(timedTranscriptComponent.refinements ?? []),
    createProductExporterFacet({
      type: timedTranscriptTypes.transcript,
      export({ value }) { return { bytes: new TextEncoder().encode(encodeTimedTranscript(value as unknown as TimedTranscript)) }; },
    }),
    createMediaRepresentationFacet(timedTranscriptMediaRepresentationPackage),
  ],
};
export default hypitPackage;

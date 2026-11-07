import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { whisperXComponent, whisperXManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: whisperXManifest }],
  facets: [
    createProducerPackageFacet(whisperXComponent.producers),
    ],
};
export default hypitPackage;

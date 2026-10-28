import { createProducerPackageFacet } from "@hypit/hypit/producer";

import { mediaDeliveryComponent } from "./component.js";
import { mediaDeliveryManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaDeliveryManifest }],
  facets: [createProducerPackageFacet(mediaDeliveryComponent.producers ?? [])],
};

export default hypitPackage;

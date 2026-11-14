import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";

import { mediaDeliveryComponent } from "./component.js";
import { mediaDeliveryManifest } from "./manifest.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(mediaDeliveryManifest), createGenerationModuleFacet(mediaDeliveryManifest),createProducerPackageFacet(mediaDeliveryComponent.producers ?? [])],
};

export default hypitPackage;

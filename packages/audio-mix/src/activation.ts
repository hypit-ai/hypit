import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { audioMixComponent } from "./component.js";
import { audioMixManifest, audioMixMarkupSurfaces, audioMixModuleRef } from "./manifest.js";
import { decodeAudioMixSurface } from "./surface.js";

export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: audioMixManifest }], facets: [
  createProducerPackageFacet(audioMixComponent.producers), createRefinementPackageFacet(audioMixComponent.refinements),
  createMarkupSurfaceFacet({ module: audioMixModuleRef, declaration: audioMixMarkupSurfaces[0]!, handler: decodeAudioMixSurface }),
] };
export default hypitPackage;

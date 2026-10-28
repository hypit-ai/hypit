import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { audioMixComponent } from "./component.js";
import { audioMixManifest, audioMixModuleRef } from "./manifest.js";
import { audioMixAuthorDeclarations } from "./declaration.js";
import { audioMixMarkupDeclarations } from "./declaration.js";

export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: audioMixManifest }], facets: [
  createProducerPackageFacet(audioMixComponent.producers), createRefinementPackageFacet(audioMixComponent.refinements),
  ...audioMixAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
  ...audioMixMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
    module: audioMixModuleRef,
    declaration,
  })),
] };
export default hypitPackage;

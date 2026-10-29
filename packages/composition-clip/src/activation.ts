import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { compositionClipComponent } from "./component.js";
import { compositionClipAuthorDeclarations, compositionClipMarkupDeclarations } from "./declaration.js";
import { compositionClipManifest, compositionClipModuleRef } from "./manifest.js";

export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: compositionClipManifest }], facets: [
  createProducerPackageFacet(compositionClipComponent.producers),
  createRefinementPackageFacet(compositionClipComponent.refinements),
  ...compositionClipAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
  ...compositionClipMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
    module: compositionClipModuleRef,
    declaration,
  })),
] };
export default hypitPackage;

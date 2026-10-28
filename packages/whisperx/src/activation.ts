import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { whisperXComponent, whisperXAuthorDeclarations, whisperXManifest, whisperXModuleRef, whisperXMarkupDeclarations } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: whisperXManifest }],
  facets: [
    createProducerPackageFacet(whisperXComponent.producers),
    ...whisperXAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...whisperXMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: whisperXModuleRef, declaration })),
    ],
};
export default hypitPackage;

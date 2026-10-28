import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { fontsourceAuthorDeclarations, fontsourceManifest, fontsourceMarkupDeclarations, fontsourceModuleRef, fontsourceStudioParameterCompanions } from "./index.js";

export default {
  format: "hypit.package@1" as const,
  modules: [{ manifest: fontsourceManifest }],
  facets: [
    ...fontsourceAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...fontsourceMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: fontsourceModuleRef, declaration })),
    createStudioCompanionFacet({ parameters: fontsourceStudioParameterCompanions }),
  ],
};

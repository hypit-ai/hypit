import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { fontsourceAuthorDeclarations, fontsourceManifest, fontsourceStudioParameterCompanions } from "./index.js";

export default {
  format: "hypit.package@1" as const,
  modules: [{ manifest: fontsourceManifest }],
  facets: [
    ...fontsourceAuthorDeclarations.map(createAuthorDeclarationFacet),
    createStudioCompanionFacet({ parameters: fontsourceStudioParameterCompanions }),
  ],
};

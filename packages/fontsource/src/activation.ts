import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { fontsourceAuthorDeclarations, fontsourceManifest } from "./index.js";

export default {
  format: "hypit.package@1" as const,
  modules: [{ manifest: fontsourceManifest }],
  facets: [
    ...fontsourceAuthorDeclarations.map(createAuthorDeclarationFacet),
  ],
};

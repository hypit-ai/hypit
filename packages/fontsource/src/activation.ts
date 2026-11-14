import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { fontsourceAuthorDeclarations, fontsourceManifest } from "./index.js";

export default {
  facets: [
    createModuleFacet(fontsourceManifest), createGenerationModuleFacet(fontsourceManifest),
    ...fontsourceAuthorDeclarations.map(createAuthorDeclarationFacet),
  ],
};

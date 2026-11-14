import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { createRequire } from "node:module";

import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createNleAudiovisualPackageFacet } from "@hypit/nle-audiovisual";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import type { BlobRef } from "@hypit/protocol";

import {
  footballRevealFlashHtmlResolver,
  footballRevealFlashNleResolver,
  footballTierBoardHtmlResolver,
  footballTierBoardManifest,
  footballTierBoardMediaAuthoring,
  footballTierBoardNleResolver,
  footballTitleHtmlResolver,
  footballTitleNleResolver,
} from "./nle-package.js";

const require = createRequire(import.meta.url);
const montserratLatinPath = require.resolve(
  "@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2",
);
export const footballMontserratLatinArtifact: BlobRef = {
  kind: "blob",
  resource: "res_ranking_football_montserrat_latin",
  size: statSync(montserratLatinPath).size,
  mediaType: "font/woff2",
};

export const hypitPackage = {
  facets: [
    createModuleFacet(footballTierBoardManifest), createGenerationModuleFacet(footballTierBoardManifest),
    createNlePackageFacet({ components: [
      footballRevealFlashNleResolver,
      footballTierBoardNleResolver,
      footballTitleNleResolver,
    ] }),
    createNleAudiovisualPackageFacet({ components: [
      footballRevealFlashHtmlResolver,
      footballTierBoardHtmlResolver,
      footballTitleHtmlResolver,
    ], resources: [{
      artifact: footballMontserratLatinArtifact,
      open: async () => new Uint8Array(await readFile(montserratLatinPath)),
    }] }),
    createNleAuthoringFacet({ componentMedia: [footballTierBoardMediaAuthoring] }),
  ],
};

export default hypitPackage;

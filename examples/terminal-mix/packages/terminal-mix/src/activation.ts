import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createLocalBlenderNlePictureTerminalFacet } from "@hypit/audiovisual-blender-local";
import { createLocalManimNlePictureTerminalFacet } from "@hypit/audiovisual-manim-local";
import { createNleAudiovisualPackageFacet } from "@hypit/nle-audiovisual";
import { createNlePackageFacet } from "@hypit/nle";

import { terminalMixBlenderSceneArtifact, terminalMixBlenderSceneBytes } from "./blender.js";
import { terminalMixBlenderTerminal, terminalMixManimTerminal } from "./identity.js";
import { terminalMixManifest } from "./manifest.js";
import {
  terminalMixBlenderHtmlVideoResolver,
  terminalMixBlenderNleResolver,
  terminalMixLabelHtmlVideoResolver,
  terminalMixLabelNleResolver,
  terminalMixManimHtmlVideoResolver,
  terminalMixManimNleResolver,
} from "./nle.js";
import { terminalMixManimSceneArtifact, terminalMixManimSceneBytes } from "./scene.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(terminalMixManifest), createGenerationModuleFacet(terminalMixManifest),
    createNlePackageFacet({
      components: [terminalMixManimNleResolver, terminalMixBlenderNleResolver, terminalMixLabelNleResolver],
    }),
    createNleAudiovisualPackageFacet({
      components: [
        terminalMixManimHtmlVideoResolver,
        terminalMixBlenderHtmlVideoResolver,
        terminalMixLabelHtmlVideoResolver,
      ],
      resources: [
        {
          artifact: terminalMixManimSceneArtifact,
          open: () => Uint8Array.from(terminalMixManimSceneBytes),
        },
        {
          artifact: terminalMixBlenderSceneArtifact,
          open: () => Uint8Array.from(terminalMixBlenderSceneBytes),
        },
      ],
    }),
    createLocalManimNlePictureTerminalFacet({ terminal: terminalMixManimTerminal }),
    createLocalBlenderNlePictureTerminalFacet({ terminal: terminalMixBlenderTerminal }),
  ],
};

export default hypitPackage;

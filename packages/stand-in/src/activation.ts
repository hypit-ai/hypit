import { standInComponent, standInManifest } from "./index.js";
import { createRunFragmentHostFacet } from "@hypit/run";
import { standInImageFragment, standInSilenceFragment, standInVideoFragment } from "./fragment.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: standInManifest }],
  components: [standInComponent],
  hostFacets: [createRunFragmentHostFacet({
    name: "@hypit/stand-in@1",
    fragments: {
      image: standInImageFragment,
      video: standInVideoFragment,
      silence: standInSilenceFragment,
    },
  })],
};

export default hypitPackage;

import { createRunFragmentHostFacet } from "@hypit/run";
import { mockImageFragment, mockMediaManifest, mockMediaModuleRef, mockSilenceFragment, mockVideoFragment } from "./index.js";
import { mockMediaComponent } from "./component.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: mockMediaManifest }],
  components: [mockMediaComponent],
  hostFacets: [createRunFragmentHostFacet({
    name: "@hypit/mock-media@1",
    fragments: { image: mockImageFragment, video: mockVideoFragment, silence: mockSilenceFragment },
  })],
};
export default hypitPackage;

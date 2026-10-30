import { createLocalHtmlRuntimeAdapterFacet } from "@hypit/provider-html-local/runtime-adapter";

const localElectronHTMLRuntimeAdapter = createLocalHtmlRuntimeAdapterFacet({
  use: "@hypit/provider-html-electron-local",
  kind: "electron",
});

export const hypitPackage = {
  format: "hypit.package@1" as const,
  facets: [localElectronHTMLRuntimeAdapter],
};

export default hypitPackage;

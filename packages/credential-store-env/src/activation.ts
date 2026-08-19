import {
  createRuntimeCredentialStoreAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
} from "@hypit/runtime-kit";

import { EnvironmentCredentialStore } from "./index.js";

const environmentCredentialStoreAdapter = createRuntimeCredentialStoreAdapterFacet({
  use: "@hypit/credential-store-env",
  validate(context) {
    const config = runtimeConfigObject(context.config, "environment CredentialStore");
    runtimeConfigExact(config, [], "environment CredentialStore");
  },
  open() {
    return { value: new EnvironmentCredentialStore() };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [environmentCredentialStoreAdapter],
};

export default hypitPackage;

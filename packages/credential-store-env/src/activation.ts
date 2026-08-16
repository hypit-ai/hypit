import {
  createRuntimeCredentialStoreAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
} from "@narratage/runtime-kit";

import { EnvironmentCredentialStore } from "./index.js";

const environmentCredentialStoreAdapter = createRuntimeCredentialStoreAdapterFacet({
  use: "@narratage/credential-store-env",
  validate(context) {
    const config = runtimeConfigObject(context.config, "environment CredentialStore");
    runtimeConfigExact(config, [], "environment CredentialStore");
  },
  open() {
    return { value: new EnvironmentCredentialStore() };
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [environmentCredentialStoreAdapter],
};

export default narratagePackage;

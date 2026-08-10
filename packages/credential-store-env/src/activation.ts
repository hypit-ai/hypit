import {
  createRuntimeServiceAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
} from "@narratage/runtime-adapter";

import { createEnvironmentCredentialStorePackage } from "./index.js";

const environmentCredentialStoreAdapter = createRuntimeServiceAdapterFacet({
  use: "@narratage/credential-store-env",
  validate(context) {
    const config = runtimeConfigObject(context.config, "environment CredentialStore");
    runtimeConfigExact(config, [], "environment CredentialStore");
  },
  create(context) {
    return createEnvironmentCredentialStorePackage({ instance: context.instance });
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/credential-store-env",
  hostFacets: [environmentCredentialStoreAdapter],
};

export default svmlPackage;

import {
  createRuntimeInfrastructureAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
} from "@narratage/runtime-kit";

import { createEnvironmentCredentialStorePackage } from "./index.js";

const environmentCredentialStoreAdapter = createRuntimeInfrastructureAdapterFacet({
  use: "@narratage/credential-store-env",
  validate(context) {
    const config = runtimeConfigObject(context.config, "environment CredentialStore");
    runtimeConfigExact(config, [], "environment CredentialStore");
  },
  create(context) {
    return createEnvironmentCredentialStorePackage({ instance: context.instance });
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [environmentCredentialStoreAdapter],
};

export default narratagePackage;

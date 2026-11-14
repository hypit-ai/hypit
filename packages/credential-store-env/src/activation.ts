import {
  createExecutionEnvironmentCredentialStoreAdapterFacet,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
} from "@hypit/execution-environment-local/extension";

import { EnvironmentCredentialStore } from "./index.js";

const environmentCredentialStoreAdapter = createExecutionEnvironmentCredentialStoreAdapterFacet({
  use: "@hypit/credential-store-env",
  validate(context) {
    const config = executionEnvironmentConfigObject(context.config, "environment CredentialStore");
    executionEnvironmentConfigExact(config, [], "environment CredentialStore");
  },
  open() {
    return { value: new EnvironmentCredentialStore() };
  },
});

export const hypitPackage = {
  facets: [environmentCredentialStoreAdapter],
};

export default hypitPackage;

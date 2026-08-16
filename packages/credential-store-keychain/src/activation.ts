import {
  createRuntimeCredentialStoreAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-kit";

import { KeychainCredentialStore } from "./store.js";

const keychainCredentialStoreRuntimeAdapter = createRuntimeCredentialStoreAdapterFacet({
  use: "@narratage/credential-store-keychain",
  validate(context) {
    const config = runtimeConfigObject(context.config, "keychain CredentialStore");
    runtimeConfigExact(config, ["service"], "keychain CredentialStore");
    runtimeConfigString(config.service, "keychain service");
  },
  open(context) {
    const config = runtimeConfigObject(context.config, "keychain CredentialStore");
    runtimeConfigExact(config, ["service"], "keychain CredentialStore");
    return { value: new KeychainCredentialStore({
      ...(runtimeConfigString(config.service, "keychain service") === undefined
        ? {} : { service: config.service as string }),
    }) };
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [keychainCredentialStoreRuntimeAdapter],
};

export default narratagePackage;

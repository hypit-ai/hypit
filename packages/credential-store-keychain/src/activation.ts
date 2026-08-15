import {
  createRuntimeComponentAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createKeychainCredentialStorePackage } from "./store.js";

const keychainCredentialStoreRuntimeAdapter = createRuntimeComponentAdapterFacet({
  use: "@narratage/credential-store-keychain",
  validate(context) {
    const config = runtimeConfigObject(context.config, "keychain CredentialStore");
    runtimeConfigExact(config, ["service"], "keychain CredentialStore");
    runtimeConfigString(config.service, "keychain service");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "keychain CredentialStore");
    runtimeConfigExact(config, ["service"], "keychain CredentialStore");
    return createKeychainCredentialStorePackage({
      instance: context.instance,
      ...(runtimeConfigString(config.service, "keychain service") === undefined
        ? {} : { service: config.service as string }),
    });
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  hostFacets: [keychainCredentialStoreRuntimeAdapter],
};

export default svmlPackage;

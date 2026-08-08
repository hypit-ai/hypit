import {
  createRuntimeServiceAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createKeychainCredentialStorePackage } from "./store.js";

const keychainCredentialStoreRuntimeAdapter = createRuntimeServiceAdapterFacet({
  use: "@narratage/credential-store-keychain",
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
  name: "@narratage/credential-store-keychain",
  hostFacets: [keychainCredentialStoreRuntimeAdapter],
};

export default svmlPackage;

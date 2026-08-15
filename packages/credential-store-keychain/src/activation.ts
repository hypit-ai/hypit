import {
  createRuntimeInfrastructureAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-kit";

import { createKeychainCredentialStorePackage } from "./store.js";

const keychainCredentialStoreRuntimeAdapter = createRuntimeInfrastructureAdapterFacet({
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

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [keychainCredentialStoreRuntimeAdapter],
};

export default narratagePackage;

import {
  createRuntimeCredentialStoreAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { OsCredentialStore } from "./store.js";

const osCredentialStoreRuntimeAdapter = createRuntimeCredentialStoreAdapterFacet({
  use: "@hypit/credential-store-os",
  validate(context) {
    const config = runtimeConfigObject(context.config, "OS CredentialStore");
    runtimeConfigExact(config, ["service"], "OS CredentialStore");
    runtimeConfigString(config.service, "OS credential service");
  },
  open(context) {
    const config = runtimeConfigObject(context.config, "OS CredentialStore");
    runtimeConfigExact(config, ["service"], "OS CredentialStore");
    return { value: new OsCredentialStore({
      ...(runtimeConfigString(config.service, "OS credential service") === undefined
        ? {} : { service: config.service as string }),
    }) };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [osCredentialStoreRuntimeAdapter],
};

export default hypitPackage;

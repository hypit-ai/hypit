import { join, resolve } from "node:path";

import {
  createRuntimeCredentialStoreAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@hypit/runtime-kit";
import type { RuntimeAdapterFactoryContext } from "@hypit/runtime-kit";

import { FileCredentialStore } from "./store.js";

/** One directory per user, beside the Host's other state and never inside an author project. */
export const fileCredentialStoreDirectoryName = "credentials";

/**
 * The configured `path` names the directory holding this store's documents and is resolved against
 * the Host state root, so a Profile can move the store without an absolute path that only works on
 * one machine. Secrets themselves never appear here.
 */
function credentialDirectory(context: RuntimeAdapterFactoryContext): string {
  const config = runtimeConfigObject(context.config, "file CredentialStore");
  runtimeConfigExact(config, ["path"], "file CredentialStore");
  const configured = runtimeConfigString(config.path, "file credential path");
  return configured === undefined
    ? join(context.hostStateRoot, fileCredentialStoreDirectoryName)
    : resolve(context.hostStateRoot, configured);
}

const fileCredentialStoreAdapter = createRuntimeCredentialStoreAdapterFacet({
  use: "@hypit/credential-store-file",
  validate(context) {
    credentialDirectory(context);
  },
  open(context) {
    return { value: new FileCredentialStore({ path: credentialDirectory(context) }) };
  },
  async doctor(context) {
    return await new FileCredentialStore({ path: credentialDirectory(context) }).diagnose();
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [fileCredentialStoreAdapter],
};

export default hypitPackage;

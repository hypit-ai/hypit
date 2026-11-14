import { join, resolve } from "node:path";
import {
  createExecutionEnvironmentCredentialStoreAdapterFacet,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import { LocalCredentialStore } from "./store.js";

const localCredentialStoreAdapter = createExecutionEnvironmentCredentialStoreAdapterFacet({
  use: "@hypit/credential-store-local",
  validate(context) {
    const config = executionEnvironmentConfigObject(context.config, "local CredentialStore");
    executionEnvironmentConfigExact(config, ["backend", "path", "service"], "local CredentialStore");
    const backend = executionEnvironmentConfigString(config.backend, "local credential backend");
    if (backend !== undefined && backend !== "system" && backend !== "file") {
      throw new Error("local credential backend must be system or file");
    }
    executionEnvironmentConfigString(config.path, "local credential path");
    executionEnvironmentConfigString(config.service, "local credential service");
  },
  open(context) {
    const config = executionEnvironmentConfigObject(context.config, "local CredentialStore");
    const backend = executionEnvironmentConfigString(config.backend, "local credential backend") as "system" | "file" | undefined;
    const path = executionEnvironmentConfigString(config.path, "local credential path");
    const service = executionEnvironmentConfigString(config.service, "local credential service");
    return {
      value: new LocalCredentialStore({
        directory: path === undefined ? join(context.hostStateRoot, "credentials") : resolve(context.hostStateRoot, path),
        ...(backend === undefined ? {} : { backend }),
        ...(service === undefined ? {} : { service }),
      }),
    };
  },
});

export const hypitPackage = {
  facets: [localCredentialStoreAdapter],
};
export default hypitPackage;

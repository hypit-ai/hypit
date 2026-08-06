import { digestOf } from "@svml/protocol";
import type {
  CredentialRef,
  CredentialStore,
  CredentialValue,
  RuntimeModuleManifest,
} from "@svml/runtime";
import { verifyCredentialRef } from "@svml/runtime";

export const environmentCredentialStoreModuleRef = {
  name: "@svml/credential-store-env",
  version: "1",
} as const;

export const environmentCredentialStoreFacet = {
  module: environmentCredentialStoreModuleRef,
  name: "credential-store",
} as const;

export const environmentCredentialStoreImplementationDigest = digestOf(
  "@svml/credential-store-env/credential-store@1",
);

export const environmentCredentialStoreRuntimeManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@2",
  name: environmentCredentialStoreModuleRef.name,
  version: environmentCredentialStoreModuleRef.version,
  facets: [{
    name: environmentCredentialStoreFacet.name,
    role: "credential-store",
    implementation: {
      locator: "@svml/credential-store-env",
      digest: environmentCredentialStoreImplementationDigest,
    },
    permissions: ["environment:credentials"],
  }],
};

/** Resolves only explicitly requested environment variables and never snapshots or enumerates env. */
export class EnvironmentCredentialStore implements CredentialStore {
  readonly #environment: NodeJS.ProcessEnv;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.#environment = environment;
  }

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    verifyCredentialRef(ref);
    if (ref.store !== "env") return undefined;
    const secret = this.#environment[ref.key];
    if (secret === undefined || secret.length === 0) return undefined;
    return { secret };
  }
}

import { digestOf } from "@narratage/protocol";
import { defineRuntimeServicePackage } from "@narratage/runtime";
import type {
  CredentialRef,
  CredentialStore,
  CredentialValue,
  RuntimeServicePackage,
} from "@narratage/runtime";
import { verifyCredentialRef } from "@narratage/runtime";

export const environmentCredentialStoreModuleRef = {
  name: "@narratage/credential-store-env",
  version: "1",
} as const;

export const environmentCredentialStoreImplementationDigest = digestOf(
  "@narratage/credential-store-env/credential-store@1",
);

export type CreateEnvironmentCredentialStorePackageOptions = {
  readonly instance?: string;
  readonly environment?: NodeJS.ProcessEnv;
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

export function createEnvironmentCredentialStorePackage(
  options: CreateEnvironmentCredentialStorePackageOptions = {},
): RuntimeServicePackage {
  const instance = options.instance ?? "credentials.env";
  return defineRuntimeServicePackage({
    name: instance,
    module: environmentCredentialStoreModuleRef,
    services: [{
      role: "credential-store",
      facet: "credential-store",
      instance,
      implementation: {
        locator: "@narratage/credential-store-env",
        digest: environmentCredentialStoreImplementationDigest,
      },
      configuration: { source: "process-environment", explicitKeysOnly: true },
      service: new EnvironmentCredentialStore(options.environment),
    }],
  });
}

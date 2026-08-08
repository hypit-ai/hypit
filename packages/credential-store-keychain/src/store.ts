import { execFile } from "node:child_process";

import { digestOf } from "@narratage/protocol";
import { defineRuntimeServicePackage, verifyCredentialRef } from "@narratage/runtime";
import type {
  CredentialRef,
  CredentialStore,
  CredentialValue,
  RuntimeServicePackage,
} from "@narratage/runtime";

export const keychainCredentialStoreModuleRef = {
  name: "@narratage/credential-store-keychain",
  version: "1",
} as const;

export const keychainCredentialStoreImplementationDigest = digestOf(
  "@narratage/credential-store-keychain/credential-store@1",
);

/** Reads one named secret. Substituted in tests so no test touches a real keychain. */
export type KeychainReader = (service: string, account: string) => Promise<string | undefined>;

export type CreateKeychainCredentialStorePackageOptions = {
  readonly instance?: string;
  /** Keychain service name every lookup is scoped to. */
  readonly service?: string;
  readonly read?: KeychainReader;
};

const DEFAULT_SERVICE = "narratage";

/**
 * `security find-generic-password -s <service> -a <account> -w`
 *
 * The account is the CredentialRef key, so a lookup asks for exactly the one
 * entry it was told to ask for. Nothing here can enumerate the keychain, and a
 * failure never carries the tool's output, which may quote the item.
 */
function macosSecurity(service: string): KeychainReader {
  return async (_service, account) => await new Promise((resolve, reject) => {
    execFile("/usr/bin/security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { timeout: 10_000, shell: false },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout.replace(/\n$/u, ""));
          return;
        }
        // 44 is "item not found": an answer, not a failure.
        if ((error as { code?: number }).code === 44) resolve(undefined);
        else reject(new Error(`keychain lookup for ${account} failed`));
      });
  });
}

/**
 * A CredentialStore backed by the operating system keychain.
 *
 * It answers only for `store: "keychain"` references, exactly as the
 * environment store answers only for `store: "env"`. Anything else is not its
 * business and it says so by returning undefined rather than guessing.
 */
export class KeychainCredentialStore implements CredentialStore {
  readonly #read: KeychainReader;
  readonly #service: string;

  constructor(options: { readonly service?: string; readonly read?: KeychainReader } = {}) {
    this.#service = options.service ?? DEFAULT_SERVICE;
    this.#read = options.read ?? macosSecurity(this.#service);
  }

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    verifyCredentialRef(ref);
    if (ref.store !== "keychain") return undefined;
    const secret = await this.#read(this.#service, ref.key);
    if (secret === undefined || secret.length === 0) return undefined;
    return { secret };
  }
}

/** The command that puts a secret where this store will find it. */
export function keychainAddCommand(key: string, service = DEFAULT_SERVICE): string {
  return `security add-generic-password -s ${service} -a ${key} -w`;
}

export function createKeychainCredentialStorePackage(
  options: CreateKeychainCredentialStorePackageOptions = {},
): RuntimeServicePackage {
  const instance = options.instance ?? "credentials.keychain";
  const service = options.service ?? DEFAULT_SERVICE;
  return defineRuntimeServicePackage({
    name: instance,
    module: keychainCredentialStoreModuleRef,
    services: [{
      role: "credential-store",
      facet: "credential-store",
      instance,
      implementation: {
        locator: "@narratage/credential-store-keychain",
        digest: keychainCredentialStoreImplementationDigest,
      },
      permissions: ["process:keychain"],
      configuration: { source: "os-keychain", service, explicitKeysOnly: true },
      service: new KeychainCredentialStore({
        service,
        ...(options.read === undefined ? {} : { read: options.read }),
      }),
    }],
  });
}

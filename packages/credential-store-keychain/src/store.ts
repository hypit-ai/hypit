import { execFile } from "node:child_process";

import { verifyCredentialRef } from "@hypit/runtime";
import type {
  CredentialRef,
  CredentialValue,
  WritableCredentialStore,
} from "@hypit/runtime";

export const keychainCredentialStoreModuleRef = {
  name: "@hypit/credential-store-keychain",
  version: "1",
} as const;

/** Reads one named secret. Substituted in tests so no test touches a real keychain. */
export type KeychainReader = (service: string, account: string) => Promise<string | undefined>;
export type KeychainWriter = (service: string, account: string, secret: string) => Promise<void>;
export type KeychainDeleter = (service: string, account: string) => Promise<boolean>;

export type CreateKeychainCredentialStorePackageOptions = {
  readonly instance?: string;
  /** Keychain service name every lookup is scoped to. */
  readonly service?: string;
  readonly read?: KeychainReader;
  readonly write?: KeychainWriter;
  readonly remove?: KeychainDeleter;
};

const DEFAULT_SERVICE = "hypit";

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

function macosWriter(service: string): KeychainWriter {
  return async (_service, account, secret) => await new Promise((resolve, reject) => {
    execFile("/usr/bin/security",
      ["add-generic-password", "-U", "-s", service, "-a", account, "-w", secret],
      { timeout: 10_000, shell: false },
      (error) => error === null ? resolve() : reject(new Error(`keychain write for ${account} failed`)));
  });
}

function macosDeleter(service: string): KeychainDeleter {
  return async (_service, account) => await new Promise((resolve, reject) => {
    execFile("/usr/bin/security",
      ["delete-generic-password", "-s", service, "-a", account],
      { timeout: 10_000, shell: false },
      (error) => {
        if (error === null) resolve(true);
        else if ((error as { code?: number }).code === 44) resolve(false);
        else reject(new Error(`keychain delete for ${account} failed`));
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
export class KeychainCredentialStore implements WritableCredentialStore {
  readonly #read: KeychainReader;
  readonly #write: KeychainWriter;
  readonly #remove: KeychainDeleter;
  readonly #service: string;

  constructor(options: {
    readonly service?: string;
    readonly read?: KeychainReader;
    readonly write?: KeychainWriter;
    readonly remove?: KeychainDeleter;
  } = {}) {
    this.#service = options.service ?? DEFAULT_SERVICE;
    this.#read = options.read ?? macosSecurity(this.#service);
    this.#write = options.write ?? macosWriter(this.#service);
    this.#remove = options.remove ?? macosDeleter(this.#service);
  }

  owns(ref: CredentialRef): boolean {
    return ref.store === "keychain";
  }

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    verifyCredentialRef(ref);
    if (ref.store !== "keychain") return undefined;
    const secret = await this.#read(this.#service, ref.key);
    if (secret === undefined || secret.length === 0) return undefined;
    return { secret };
  }

  async put(ref: CredentialRef, value: CredentialValue): Promise<void> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) throw new Error(`keychain CredentialStore does not own ${ref.store}`);
    if (value.secret.length === 0) throw new Error("credential secret is empty");
    await this.#write(this.#service, ref.key, value.secret);
  }

  async delete(ref: CredentialRef): Promise<boolean> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) throw new Error(`keychain CredentialStore does not own ${ref.store}`);
    return await this.#remove(this.#service, ref.key);
  }
}

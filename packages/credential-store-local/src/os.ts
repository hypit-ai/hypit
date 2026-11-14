import { execFile } from "node:child_process";
import { windowsCredential } from "./windows.js";

import { verifyCredentialRef } from "@hypit/execution-environment-local/extension";
import type {
  CredentialRef,
  CredentialValue,
  WritableCredentialStore,
} from "@hypit/execution-environment-local/extension";

export const osCredentialStoreModuleRef = {
  name: "@hypit/credential-store-local",
} as const;

export type OsCredentialReader = (service: string, account: string) => Promise<string | undefined>;
export type OsCredentialWriter = (service: string, account: string, secret: string) => Promise<void>;
export type OsCredentialDeleter = (service: string, account: string) => Promise<boolean>;

const DEFAULT_SERVICE = "hypit";

function macosReader(service: string): OsCredentialReader {
  return async (_service, account) => await new Promise((resolve, reject) => {
    execFile("/usr/bin/security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
      timeout: 10_000, shell: false, windowsHide: true,
    }, (error, stdout) => {
      if (error === null) resolve(stdout.replace(/\n$/u, ""));
      else if ((error as { code?: number }).code === 44) resolve(undefined);
      else reject(new Error(`OS credential lookup for ${account} failed`));
    });
  });
}

function macosWriter(service: string): OsCredentialWriter {
  return async (_service, account, secret) => await new Promise((resolve, reject) => {
    // macOS security(1) requires the password as the argument to -w; it does
    // not read an omitted -w value from stdin. execFile keeps shell expansion
    // out of the path and the callback never includes the secret in errors.
    execFile("/usr/bin/security", [
      "add-generic-password", "-U", "-s", service, "-a", account, "-w", secret,
    ], {
      timeout: 10_000, shell: false, windowsHide: true,
    }, (error) => {
      if (error === null) resolve();
      else reject(new Error(`OS credential write for ${account} failed`));
    });
  });
}

function macosDeleter(service: string): OsCredentialDeleter {
  return async (_service, account) => await new Promise((resolve, reject) => {
    execFile("/usr/bin/security", ["delete-generic-password", "-s", service, "-a", account], {
      timeout: 10_000, shell: false, windowsHide: true,
    }, (error) => {
      if (error === null) resolve(true);
      else if ((error as { code?: number }).code === 44) resolve(false);
      else reject(new Error(`OS credential delete for ${account} failed`));
    });
  });
}

function windowsBackend(): {
  readonly read: OsCredentialReader;
  readonly write: OsCredentialWriter;
  readonly remove: OsCredentialDeleter;
} {
  return {
    read: async (service, account) => {
      const result = await windowsCredential("read", service, account);
      return result.found === true && result.secret !== undefined
        ? Buffer.from(result.secret, "base64").toString("utf8")
        : undefined;
    },
    write: async (service, account, secret) => {
      await windowsCredential("write", service, account, secret);
    },
    remove: async (service, account) => (await windowsCredential("delete", service, account)).deleted === true,
  };
}

function platformBackend(service: string) {
  if (process.platform === "darwin") {
    return { read: macosReader(service), write: macosWriter(service), remove: macosDeleter(service) };
  }
  if (process.platform === "win32") return windowsBackend();
  // A Profile that selects this Store cannot be repaired by anything the user does here, and the
  // other Stores are the answer, so name them where the failure is read.
  throw new Error("System credential storage supports macOS and Windows only; select "
    + "@hypit/credential-store-local with backend file, or @hypit/credential-store-env "
    + "for an externally supplied value");
}

/** One logical writable store backed by the current user's OS credential locker. */
export class OsCredentialStore implements WritableCredentialStore {
  readonly #read: OsCredentialReader;
  readonly #write: OsCredentialWriter;
  readonly #remove: OsCredentialDeleter;
  readonly #service: string;

  constructor(options: {
    readonly service?: string;
    readonly read?: OsCredentialReader;
    readonly write?: OsCredentialWriter;
    readonly remove?: OsCredentialDeleter;
  } = {}) {
    this.#service = options.service ?? DEFAULT_SERVICE;
    const supplied = options.read !== undefined || options.write !== undefined || options.remove !== undefined;
    if (supplied && (options.read === undefined || options.write === undefined || options.remove === undefined)) {
      throw new Error("OS CredentialStore test backend must provide read, write and remove together");
    }
    const backend = supplied
      ? { read: options.read!, write: options.write!, remove: options.remove! }
      : platformBackend(this.#service);
    this.#read = backend.read;
    this.#write = backend.write;
    this.#remove = backend.remove;
  }

  owns(ref: CredentialRef): boolean {
    return ref.store === "os";
  }

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) return undefined;
    const secret = await this.#read(this.#service, ref.key);
    return secret === undefined || secret.length === 0 ? undefined : { secret };
  }

  async put(ref: CredentialRef, value: CredentialValue): Promise<void> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) throw new Error(`OS CredentialStore does not own ${ref.store}`);
    if (value.secret.length === 0) throw new Error("credential secret is empty");
    await this.#write(this.#service, ref.key, value.secret);
  }

  async delete(ref: CredentialRef): Promise<boolean> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) throw new Error(`OS CredentialStore does not own ${ref.store}`);
    return await this.#remove(this.#service, ref.key);
  }
}

import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { verifyCredentialRef } from "@hypit/runtime";
import type {
  CredentialRef,
  CredentialValue,
  WritableCredentialStore,
} from "@hypit/runtime";

export const osCredentialStoreModuleRef = {
  name: "@hypit/credential-store-os",
  version: "1",
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
    const child = spawn("/usr/bin/security", ["add-generic-password", "-U", "-s", service, "-a", account, "-w"], {
      shell: false, windowsHide: true, stdio: ["pipe", "ignore", "ignore"],
    });
    const timeout = setTimeout(() => child.kill(), 10_000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`OS credential write for ${account} failed`));
    });
    child.stdin.end(`${secret}\n`);
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

type WindowsCredentialResult = {
  readonly found?: boolean;
  readonly deleted?: boolean;
  readonly secret?: string;
};

const windowsScript = fileURLToPath(new URL("../runtime/windows-credential.ps1", import.meta.url));

function windowsCredential(
  operation: "read" | "write" | "delete",
  service: string,
  account: string,
  secret?: string,
): Promise<WindowsCredentialResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", windowsScript, "-Operation", operation,
    ], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    child.on("error", fail);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 4 * 1024 * 1024) fail(new Error("Windows credential response is too large"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64 * 1024) fail(new Error("Windows credential error is too large"));
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(`Windows credential ${operation} for ${account} failed${stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.replace(/^\uFEFF/u, "").trim()) as WindowsCredentialResult;
        settled = true;
        resolve(result);
      } catch {
        fail(new Error(`Windows credential ${operation} returned an invalid response`));
      }
    });
    child.stdin.end(JSON.stringify({
      service,
      account,
      ...(secret === undefined ? {} : { secret: Buffer.from(secret, "utf8").toString("base64") }),
    }));
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
  throw new Error("OS CredentialStore supports macOS and Windows only");
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

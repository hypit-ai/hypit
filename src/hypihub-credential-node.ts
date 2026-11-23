import { execFile } from "node:child_process";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { HypiHubOAuthError, readHypiHubOAuthRecord, type HypiHubOAuthStore } from "@hypit/provider-hypihub";
import { nodeHypitDataRoot } from "./node-data-root.js";

type CredentialSlot = Omit<HypiHubOAuthStore, "withLock">;
const SERVICE = "ai.hypit.hypihub.oauth";
const windowsBridge = fileURLToPath(new URL("../runtime/hypihub-windows-credential.ps1", import.meta.url));

function unavailable(message: string): HypiHubOAuthError {
  return new HypiHubOAuthError("hypihub-oauth-unavailable", message);
}

function errno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function decode(contents: string, store: string) {
  try { return readHypiHubOAuthRecord(JSON.parse(contents)); }
  catch { throw unavailable(`Invalid HypiHub credential in ${store}.`); }
}

function run(
  command: string, args: string[], input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { timeout: 15_000, windowsHide: true, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : error.code;
        if (typeof code !== "number") reject(unavailable("Could not access the system credential store."));
        else resolve({ code, stdout, stderr });
      });
    child.stdin?.once("error", () => {
      child.kill();
      reject(unavailable("Could not send a request to the system credential store."));
    });
    child.stdin?.end(input);
  });
}

function macOSSlot(slot: string): CredentialSlot {
  const selector = ["-s", SERVICE, "-a", slot];
  const security = "/usr/bin/security";
  return {
    async read() {
      const { code, stdout } = await run(security, ["find-generic-password", ...selector, "-w"]);
      if (code === 44) return undefined;
      if (code !== 0) throw unavailable("Could not read the HypiHub credential from macOS Keychain.");
      return decode(Buffer.from(stdout.trim(), "base64url").toString("utf8"), "macOS Keychain");
    },
    async write(value) {
      const secret = Buffer.from(JSON.stringify(value)).toString("base64url");
      // The security interpreter accepts one command on stdin, keeping the secret out of argv.
      const { code, stderr } = await run(security, ["-q", "-i"], `add-generic-password -U ${selector.join(" ")} -w ${secret}\n`);
      if (code !== 0 || stderr.trim() !== "") throw unavailable("Could not save the HypiHub credential to macOS Keychain.");
    },
    async remove() {
      const { code } = await run(security, ["delete-generic-password", ...selector]);
      if (code !== 0 && code !== 44) throw unavailable("Could not remove the HypiHub credential from macOS Keychain.");
    },
  };
}

function windowsSlot(slot: string): CredentialSlot {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw unavailable("Windows SystemRoot is unavailable.");
  const powershell = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const target = `${SERVICE}/${slot}`;
  async function request(operation: "read" | "write" | "remove", contents?: Buffer) {
    if (contents !== undefined && contents.byteLength > 2560) {
      throw unavailable("The HypiHub credential exceeds the Windows Credential Manager limit of 2560 bytes.");
    }
    const { code, stdout, stderr } = await run(powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", windowsBridge, "-Operation", operation,
    ], JSON.stringify({ target, ...(contents === undefined ? {} : { secret: contents.toString("base64") }) }));
    if (code !== 0) {
      const detail = stderr.trim().split(/\r?\n/)[0]?.slice(0, 200);
      throw unavailable(detail
        ? `Could not ${operation} the HypiHub credential in Windows Credential Manager (${detail}).`
        : `Could not ${operation} the HypiHub credential in Windows Credential Manager.`);
    }
    return stdout.trim();
  }
  return {
    async read() {
      const encoded = await request("read");
      return encoded === "" ? undefined : decode(Buffer.from(encoded, "base64").toString("utf8"), "Windows Credential Manager");
    },
    async write(value) { await request("write", Buffer.from(JSON.stringify(value))); },
    async remove() { await request("remove"); },
  };
}

function ownerPrivate(info: Stats): boolean {
  return info.uid === process.geteuid?.() && (info.mode & 0o077) === 0;
}

async function privateDirectory(directory: string, create: boolean): Promise<boolean> {
  if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory).catch(error => {
    if (!create && errno(error, "ENOENT")) return undefined;
    throw error;
  });
  if (info === undefined) return false;
  if (!info.isDirectory() || !ownerPrivate(info)) {
    throw unavailable(`HypiHub credential directory must be owned by this user and private: ${directory}`);
  }
  return true;
}

function checkPrivateFile(info: Stats, directory: string) {
  if (!info.isFile() || !ownerPrivate(info) || info.nlink > 1) {
    throw unavailable(`HypiHub needs an owner-private regular credential file in ${directory}.`);
  }
}

async function syncDirectory(directory: string) {
  const file = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await file.sync(); }
  finally { await file.close(); }
}

/** Owner-private JSON for POSIX hosts that run without a desktop keyring. */
function privateFileCredentialSlot(directory: string, slot: string, temporary: string): CredentialSlot {
  const path = join(directory, `${slot}.json`);
  return {
    async read() {
      if (!await privateDirectory(directory, false)) return undefined;
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(error => {
        if (errno(error, "ENOENT")) return undefined;
        throw unavailable(`Could not open the private HypiHub credential file in ${directory}.`);
      });
      if (file === undefined) return undefined;
      try {
        checkPrivateFile(await file.stat(), directory);
        return decode(await file.readFile("utf8"), "the private credential file");
      } finally {
        await file.close();
      }
    },
    async write(value) {
      await privateDirectory(directory, true);
      const file = await open(temporary, "wx", 0o600);
      try {
        try {
          checkPrivateFile(await file.stat(), directory);
          await file.writeFile(JSON.stringify(value) + "\n", "utf8");
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, path);
        await syncDirectory(directory);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    async remove() {
      if (!await privateDirectory(directory, false)) return;
      try { await unlink(path); }
      catch (error) { if (errno(error, "ENOENT")) return; throw error; }
      await syncDirectory(directory);
    },
  };
}

/** The host owns storage and one process-released lock per origin and credential slot. */
export function openLocalHypiHubCredentialSlot(slot: string): HypiHubOAuthStore {
  const platform = process.platform;
  const directory = join(nodeHypitDataRoot(), "credentials", "hypihub");
  const temporary = join(directory, `.${slot}.tmp`);
  let credential: CredentialSlot;
  switch (platform) {
    case "darwin": credential = macOSSlot(slot); break;
    case "win32": credential = windowsSlot(slot); break;
    case "linux": credential = privateFileCredentialSlot(directory, slot, temporary); break;
    default: throw unavailable("This Node host needs a HypiHub OAuth credential store.");
  }
  return {
    ...credential,
    async withLock(operation) {
      if (platform === "linux") await privateDirectory(directory, true);
      else await mkdir(directory, { recursive: true, mode: 0o700 });
      const { DatabaseSync } = await import("node:sqlite");
      const lock = new DatabaseSync(join(directory, `${slot}.sqlite`));
      try {
        const deadline = Date.now() + 2_000;
        for (;;) {
          try { lock.exec("BEGIN EXCLUSIVE"); break; }
          catch (error) {
            // SQLITE_BUSY means another connection owns this slot. Wait without blocking its process.
            if (!(error instanceof Error && "errcode" in error && error.errcode === 5)) {
              throw unavailable("Could not lock the HypiHub credential slot.");
            }
            if (Date.now() >= deadline) throw unavailable("This HypiHub credential slot is busy.");
            await delay(50);
          }
        }
        // A process interrupted before rename can leave one staged copy in the private directory.
        if (platform === "linux") await rm(temporary, { force: true });
        return await operation();
      } finally {
        lock.close();
      }
    },
  };
}

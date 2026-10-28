import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type WindowsCredentialResult = {
  readonly found?: boolean;
  readonly deleted?: boolean;
  readonly secret?: string;
};

const windowsScript = fileURLToPath(new URL("../runtime/windows-credential.ps1", import.meta.url));

function windowsPowerShell(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (systemRoot === undefined) throw new Error("Windows SystemRoot is unavailable");
  return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** PasswordVault password field; OAuth JSON routinely exceeds this. */
export const windowsLockerPasswordLimit = 512;

export function assertWindowsLockerSecret(secret: string, account: string): void {
  if (secret.length > windowsLockerPasswordLimit) {
    throw new Error(
      `Windows Credential Locker cannot store the ${secret.length}-character secret for ${account}`
      + ` (PasswordVault limit is ${windowsLockerPasswordLimit} characters).`
      + " Select @hypit/credential-store-local with backend file for OAuth tokens.",
    );
  }
}

/** The OS adapter owns this one child; Node owns its timeout, bounded output and termination. */
export function windowsCredential(
  operation: "read" | "write" | "delete",
  service: string,
  account: string,
  secret?: string,
): Promise<WindowsCredentialResult> {
  if (secret !== undefined) assertWindowsLockerSecret(secret, account);
  return new Promise((resolve, reject) => {
    const child = execFile(windowsPowerShell(), [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", windowsScript, "-Operation", operation,
    ], {
      shell: false, windowsHide: true, encoding: "utf8", timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(new Error(`Windows credential ${operation} for ${account} failed`
          + (error.code === undefined ? "" : ` (${error.code})`)
          + (error.killed ? " (child terminated)" : "")
          + (stderr.trim().length === 0 ? "" : `: ${stderr.trim()}`)));
        return;
      }
      try { resolve(JSON.parse(stdout.replace(/^\uFEFF/u, "").trim()) as WindowsCredentialResult); }
      catch { reject(new Error(`Windows credential ${operation} returned an invalid response`)); }
    });
    // A closed input pipe is an operation failure too. Do not leave the child waiting for a request.
    child.stdin!.on("error", () => {
      child.kill();
      reject(new Error(`Windows credential ${operation} request could not be written`));
    });
    child.stdin!.end(JSON.stringify({
      service, account,
      ...(secret === undefined ? {} : { secret: Buffer.from(secret, "utf8").toString("base64") }),
    }));
  });
}

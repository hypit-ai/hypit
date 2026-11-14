import { replaceFile } from "@hypit/hypit/atomic-file";
import { randomUUID } from "node:crypto";
import { mkdir, open, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { verifyCredentialRef } from "@hypit/execution-environment-local/extension";
import type { CredentialRef, CredentialValue, WritableCredentialStore } from "@hypit/execution-environment-local/extension";

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function credentialValue(value: unknown): CredentialValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid credential value");
  const record = value as Record<string, unknown>;
  if (typeof record.secret !== "string" || record.secret.length === 0
    || (record.expiresAt !== undefined && (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)))) {
    throw new Error("invalid credential value");
  }
  return { secret: record.secret, ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt as number }) };
}

/** One file per Store-local key; no enumeration, index or cross-key read/modify/write. */
export class FileCredentialStore implements WritableCredentialStore {
  constructor(readonly directory: string) {}

  owns(ref: CredentialRef): boolean { return ref.store === "file"; }

  #path(ref: CredentialRef): string {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) throw new Error(`File CredentialStore does not own ${ref.store}`);
    // Reversible UTF-16 encoding preserves the opaque JS key, even on case-insensitive filesystems.
    // The prefix avoids reserved OS filenames; no key characters become path separators.
    return join(this.directory, `key-${Buffer.from(ref.key, "utf16le").toString("hex")}.json`);
  }

  async #privateDirectory(create: boolean): Promise<void> {
    if (create) await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await stat(this.directory);
    if (!info.isDirectory()) throw new Error(`Credential path is not a directory: ${this.directory}`);
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
      throw new Error(`Credential directory must be owner-private: ${this.directory}. On WSL, keep credentials in the Linux filesystem rather than a Windows-mounted drive.`);
    }
  }

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    if (!this.owns(ref)) return undefined;
    const path = this.#path(ref);
    try { await this.#privateDirectory(false); } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
    let file;
    try { file = await open(path, "r"); } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
    try {
      const info = await file.stat();
      if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
        throw new Error(`Credential file must be owner-private: ${path}. On WSL, keep credentials in the Linux filesystem rather than a Windows-mounted drive.`);
      }
      const text = await file.readFile("utf8");
      // JSON parser messages may include secret bytes. Report the file, never its contents.
      try { return credentialValue(JSON.parse(text)); } catch {
        throw new Error(`Cannot decode credential file: ${path}; replace it with auth login or remove it with auth logout`);
      }
    } finally { await file.close(); }
  }

  async put(ref: CredentialRef, value: CredentialValue): Promise<void> {
    const path = this.#path(ref);
    const contents = JSON.stringify(credentialValue(value));
    await this.#privateDirectory(true);
    const temporary = join(this.directory, `.write-${randomUUID()}.tmp`);
    const file = await open(temporary, "wx", 0o600);
    try {
      try { await file.writeFile(`${contents}\n`, "utf8"); } finally { await file.close(); }
      await replaceFile(temporary, path);
    } finally { await rm(temporary, { force: true }); }
  }

  async delete(ref: CredentialRef): Promise<boolean> {
    const path = this.#path(ref);
    // Deletion never opens or decodes the old document.
    try { await unlink(path); return true; } catch (error) {
      if (missing(error)) return false;
      throw error;
    }
  }
}

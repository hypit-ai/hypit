import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";

import { verifyCredentialRef } from "@hypit/runtime";
import type {
  CredentialRef,
  CredentialValue,
  WritableCredentialStore,
} from "@hypit/runtime";

export const fileCredentialStoreModuleRef = {
  name: "@hypit/credential-store-file",
  version: "1",
} as const;

/** The one document shape this store owns; anything else is refused rather than reinterpreted. */
export const fileCredentialDocumentFormat = "hypit.file-credential@1";

/** In-flight writes are dot-prefixed, so only complete documents are ever candidates. */
const temporaryPrefix = ".";

export type FileCredentialStoreDiagnostic = {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly subject?: string;
};

type StoredDocument = {
  readonly key: string;
  readonly secret: string;
};

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

/**
 * One document per key. A key may be any non-empty string, so its file name is the digest and the
 * document repeats the key: a reader proves the document belongs to the reference it resolved, and
 * two keys can never share one file.
 */
function documentName(key: string): string {
  return `${createHash("sha256").update(key, "utf8").digest("hex")}.json`;
}

function documentPath(directory: string, key: string): string {
  return join(directory, documentName(key));
}

/** One complete document, or undefined when this key has none yet. */
async function readDocument(path: string): Promise<StoredDocument | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw new Error(`file CredentialStore cannot read ${path}`, { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`file CredentialStore document ${path} is not valid JSON`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`file CredentialStore document ${path} is not an object`);
  }
  const candidate = parsed as { readonly format?: unknown; readonly key?: unknown; readonly secret?: unknown };
  if (candidate.format !== fileCredentialDocumentFormat) {
    throw new Error(`file CredentialStore document ${path} does not declare format ${fileCredentialDocumentFormat}`);
  }
  if (typeof candidate.key !== "string" || candidate.key.length === 0) {
    throw new Error(`file CredentialStore document ${path} names no credential`);
  }
  if (typeof candidate.secret !== "string" || candidate.secret.length === 0) {
    throw new Error(`file CredentialStore document ${path} has no usable secret`);
  }
  return { key: candidate.key, secret: candidate.secret };
}

/**
 * Write one key's document through a private temporary file in the same directory. The rename makes
 * a reader observe either the previous document or the new one and never a partial write, and it
 * replaces a symbolic link at the destination instead of writing through it. The temporary file is
 * created exclusive with owner-only permissions, so a secret is never briefly world-readable.
 */
async function writeDocument(directory: string, key: string, secret: string): Promise<void> {
  const path = documentPath(directory, key);
  const temporary = join(directory, `${temporaryPrefix}${documentName(key)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(
          `${JSON.stringify({ format: fileCredentialDocumentFormat, key, secret }, null, 2)}\n`,
          "utf8",
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    throw new Error(`file CredentialStore cannot write ${path}`, { cause: error });
  }
}

/**
 * Writable CredentialStore backed by one owner-private document per credential key. Every write
 * touches exactly one key's document, so a writer in another process cannot erase a credential it
 * did not write, and one damaged document does not affect any other key.
 */
export class FileCredentialStore implements WritableCredentialStore {
  readonly #directory: string;
  readonly #platform: NodeJS.Platform;

  constructor(options: {
    /** Directory holding this store's documents; it is created on the first write. */
    readonly path: string;
    /** Test seam for the permission diagnostics, which are meaningless on Windows ACLs. */
    readonly platform?: NodeJS.Platform;
  }) {
    if (options.path.trim().length === 0) throw new Error("file CredentialStore path is empty");
    this.#directory = options.path;
    this.#platform = options.platform ?? process.platform;
  }

  /** The directory this store owns; a caller may report the location, never a document's bytes. */
  get path(): string {
    return this.#directory;
  }

  owns(ref: CredentialRef): boolean {
    return ref.store === "file";
  }

  async resolve(ref: CredentialRef): Promise<CredentialValue | undefined> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) return undefined;
    const path = documentPath(this.#directory, ref.key);
    const document = await readDocument(path);
    if (document === undefined) return undefined;
    if (document.key !== ref.key) {
      throw new Error(`file CredentialStore document ${path} belongs to another credential`);
    }
    return { secret: document.secret };
  }

  async put(ref: CredentialRef, value: CredentialValue): Promise<void> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) throw new Error(`file CredentialStore does not own ${ref.store}`);
    if (value.secret.length === 0) throw new Error("credential secret is empty");
    await writeDocument(this.#directory, ref.key, value.secret);
  }

  /** Removal never reads the document, so a damaged credential can still be deleted. */
  async delete(ref: CredentialRef): Promise<boolean> {
    verifyCredentialRef(ref);
    if (!this.owns(ref)) throw new Error(`file CredentialStore does not own ${ref.store}`);
    const path = documentPath(this.#directory, ref.key);
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if (errorCode(error) === "ENOENT") return false;
      throw new Error(`file CredentialStore cannot delete ${path}`, { cause: error });
    }
  }

  /** The store's own health: unreadable or misplaced documents, and secrets other users can read. */
  async diagnose(): Promise<readonly FileCredentialStoreDiagnostic[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.#directory, { withFileTypes: true });
    } catch (error) {
      if (errorCode(error) === "ENOENT") return [];
      return [{
        severity: "error",
        code: "FILE_CREDENTIAL_STORE_UNUSABLE",
        message: `file CredentialStore cannot inspect ${this.#directory}`,
        subject: this.#directory,
      }];
    }
    const diagnostics: FileCredentialStoreDiagnostic[] = [];
    await this.#diagnosePermissions(this.#directory, diagnostics);
    for (const entry of entries) {
      if (entry.name.startsWith(temporaryPrefix) || !entry.name.endsWith(".json")) continue;
      const path = join(this.#directory, entry.name);
      let document: StoredDocument | undefined;
      try {
        document = await readDocument(path);
      } catch (error) {
        diagnostics.push({
          severity: "error",
          code: "FILE_CREDENTIAL_DOCUMENT_UNUSABLE",
          message: error instanceof Error ? error.message : `file CredentialStore cannot read ${path}`,
          subject: path,
        });
      }
      if (document !== undefined && documentPath(this.#directory, document.key) !== path) {
        diagnostics.push({
          severity: "error",
          code: "FILE_CREDENTIAL_DOCUMENT_MISPLACED",
          message: `file CredentialStore document ${path} does not hold the credential its name selects`,
          subject: path,
        });
      }
      await this.#diagnosePermissions(path, diagnostics);
    }
    return diagnostics;
  }

  async #diagnosePermissions(path: string, diagnostics: FileCredentialStoreDiagnostic[]): Promise<void> {
    if (this.#platform === "win32") return;
    let mode: number;
    try {
      mode = (await stat(path)).mode;
    } catch (error) {
      if (errorCode(error) === "ENOENT") return;
      diagnostics.push({
        severity: "error",
        code: "FILE_CREDENTIAL_STORE_UNUSABLE",
        message: `file CredentialStore cannot inspect ${path}`,
        subject: path,
      });
      return;
    }
    if ((mode & 0o077) === 0) return;
    diagnostics.push({
      severity: "warning",
      code: "FILE_CREDENTIAL_PERMISSIONS_OPEN",
      message: `file CredentialStore ${path} is readable by other local users; run chmod 600 ${path}`,
      subject: path,
    });
  }
}

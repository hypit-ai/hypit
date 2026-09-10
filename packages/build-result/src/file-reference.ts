import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { BuildResultFileRange, BuildResultFileRef } from "./types.js";

/** Address access belongs to the Repository adapter, not the value or domain graph. */
export type ExternalFileAccess = {
  size(uri: string): Promise<number>;
  open(uri: string, range?: BuildResultFileRange): Promise<AsyncIterable<Uint8Array>>;
};

/** The Node distribution's external files are explicit file: URLs supplied by its Workspace. */
export const localExternalFiles: ExternalFileAccess = {
  async size(uri) { return (await stat(fileURLToPath(uri))).size; },
  async open(uri, range) {
    if (range !== undefined) {
      const size = await localExternalFiles.size(uri);
      if (!Number.isSafeInteger(range.start) || range.start < 0
        || !Number.isSafeInteger(range.endExclusive) || range.endExclusive <= range.start
        || range.endExclusive > size) throw new Error(`Invalid file range for ${uri}`);
    }
    return createReadStream(fileURLToPath(uri), range === undefined ? {} : { start: range.start, end: range.endExclusive - 1 });
  },
};

export function fileReferenceIdentity(owner: string, file: BuildResultFileRef): string {
  return file.kind === "external-file" ? JSON.stringify(["external", file.uri])
    : JSON.stringify(["result", file.build ?? owner, file.path]);
}

/** Make a relative Result file reference independent of its enclosing value document. */
export function ownedFileReference(owner: string, file: BuildResultFileRef): BuildResultFileRef {
  return file.kind === "build-file" ? { ...file, build: file.build ?? owner } : file;
}

/** Reopening an external reference reads its current metadata, without comparing versions. */
export async function currentFileReference(
  file: BuildResultFileRef,
  access: ExternalFileAccess = localExternalFiles,
): Promise<BuildResultFileRef> {
  return file.kind === "external-file" ? { ...file, size: await access.size(file.uri) } : file;
}

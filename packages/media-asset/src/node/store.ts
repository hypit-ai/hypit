import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { BlobRef } from "@hypit/protocol";

import {
  parseMediaAssetDocument,
  resolveMediaAssetDocument,
} from "../index.js";
import type {
  MediaAssetDocument,
  MediaAssetFileResolution,
  PreparedMediaAsset,
} from "../index.js";

export type NodeMediaAssetFileResolver = (
  path: string,
  mediaType: string,
  resolution: MediaAssetFileResolution,
) => BlobRef | Promise<BlobRef>;

/** Read and validate one complete `hypit.media-asset@1` JSON file. */
export async function readMediaAssetDocumentFile(path: string): Promise<MediaAssetDocument> {
  return parseMediaAssetDocument(await readFile(path, "utf8"));
}

/**
 * Resolve every declared file relative to the manifest and nowhere else.
 * Byte staging remains an explicit Host callback rather than a hidden ResourceStore.
 */
export async function resolveMediaAssetDocumentFile(
  path: string,
  resolver: NodeMediaAssetFileResolver,
): Promise<PreparedMediaAsset> {
  const manifest = resolve(path);
  const base = dirname(manifest);
  const document = await readMediaAssetDocumentFile(manifest);
  return await resolveMediaAssetDocument(document, async (file, resolution) => {
    const target = resolve(base, file.path);
    const local = relative(base, target);
    if (local === "" || local === ".." || local.startsWith(`..${sep}`)
      || isAbsolute(local) || resolve(base, local) !== target) {
      throw new Error(`Media Asset file ${file.path} leaves its manifest directory.`);
    }
    return await resolver(target, file.mediaType, resolution);
  });
}

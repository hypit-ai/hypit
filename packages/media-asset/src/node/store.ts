import { link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { BlobRef } from "@hypit/protocol";

import {
  parseMediaAssetDocument,
  resolveMediaAssetMedia,
  resolveMediaAssetDocument,
  serializeMediaAssetDocument,
} from "../index.js";
import type {
  MediaAssetDocument,
  MediaAssetFileResolution,
  ResolvedMedia,
  ResolvedMediaAsset,
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

/** Atomically create one new manifest without replacing an existing authority. */
export async function writeMediaAssetDocumentFile(path: string, document: MediaAssetDocument): Promise<void> {
  const destination = resolve(path);
  if (await stat(destination).then(() => true, () => false)) {
    throw new Error(`Media Asset document ${destination} already exists.`);
  }
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(directory, ".hypit-media-asset-write-"));
  const temporary = join(temporaryDirectory, basename(destination));
  try {
    await writeFile(temporary, serializeMediaAssetDocument(document), { encoding: "utf8", flag: "wx" });
    await link(temporary, destination);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/**
 * Resolve every declared file relative to the manifest and nowhere else.
 * Byte staging remains an explicit Host callback rather than a hidden ResourceStore.
 */
export async function resolveMediaAssetDocumentFile(
  path: string,
  resolver: NodeMediaAssetFileResolver,
): Promise<ResolvedMediaAsset> {
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
/** Open only the primary media file; Representation files stay cold until explicitly requested. */
export async function resolveMediaAssetMediaFile(
  path: string,
  resolver: NodeMediaAssetFileResolver,
): Promise<ResolvedMedia> {
  const manifest = resolve(path);
  const base = dirname(manifest);
  const document = await readMediaAssetDocumentFile(manifest);
  return await resolveMediaAssetMedia(document, async (file, resolution) => {
    const target = resolve(base, file.path);
    const local = relative(base, target);
    if (local === "" || local === ".." || local.startsWith(`..${sep}`)
      || isAbsolute(local) || resolve(base, local) !== target) {
      throw new Error(`Media Asset file ${file.path} leaves its manifest directory.`);
    }
    return await resolver(target, file.mediaType, resolution);
  });
}

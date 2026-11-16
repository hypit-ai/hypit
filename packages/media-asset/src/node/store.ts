import { link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  parseMediaAssetDocument,
  resolveMediaAssetDocument,
  resolveMediaAssetMedia,
  serializeMediaAssetDocument,
} from "../index.js";
import type {
  MediaAssetDocument,
  MediaAssetFileResolution,
  ResolvedMediaAsset,
} from "../index.js";
import type { MediaResource, ResolvedMedia } from "@hypit/media";

export type NodeMediaAssetFileResolver = (
  path: string,
  mediaType: string,
  resolution: MediaAssetFileResolution,
) => MediaResource | Promise<MediaResource>;

export async function readMediaAssetDocumentFile(path: string): Promise<MediaAssetDocument> {
  return parseMediaAssetDocument(await readFile(path, "utf8"));
}

/** Atomically create a new manifest without replacing an existing author object. */
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

function resolveDeclaredFile(base: string, declared: string): string {
  const target = resolve(base, declared);
  const local = relative(base, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)
    || isAbsolute(local) || resolve(base, local) !== target) {
    throw new Error(`Media Asset file ${declared} leaves its manifest directory.`);
  }
  return target;
}

export async function resolveMediaAssetDocumentFile(
  path: string,
  resolver: NodeMediaAssetFileResolver,
): Promise<ResolvedMediaAsset> {
  const manifest = resolve(path);
  const base = dirname(manifest);
  const document = await readMediaAssetDocumentFile(manifest);
  return await resolveMediaAssetDocument(document, async (file, resolution) =>
    await resolver(resolveDeclaredFile(base, file.path), file.mediaType, resolution));
}

/** Open only the primary media; optional Representations remain cold. */
export async function resolveMediaAssetMediaFile(
  path: string,
  resolver: NodeMediaAssetFileResolver,
): Promise<ResolvedMedia> {
  const manifest = resolve(path);
  const base = dirname(manifest);
  const document = await readMediaAssetDocumentFile(manifest);
  return await resolveMediaAssetMedia(document, async (file, resolution) =>
    await resolver(resolveDeclaredFile(base, file.path), file.mediaType, resolution));
}

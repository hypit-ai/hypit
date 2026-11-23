import { copyFile, link, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createMediaAssetDocument } from "../index.js";
import type {
  MediaAdoptionContext,
  MediaAssetDocument,
  MediaAssetFile,
} from "../index.js";
import { interpretMedia, selectMediaStreams, type MediaInspection, type MediaSelectionRequest } from "@hypit/media";
import { writeMediaAssetDocumentFile } from "./store.js";

export type AdoptMediaFileRequest = {
  readonly sourcePath: string;
  readonly assetPath: string;
  readonly mediaType: string;
  readonly filePolicy?: "copy" | "link";
  readonly mediaFile?: string;
};

export type AdoptMediaFileHost = {
  readonly inspect: (
    path: string,
    context: MediaAdoptionContext,
  ) => MediaInspection | Promise<MediaInspection>;
  readonly select: (inspection: MediaInspection) => MediaSelectionRequest;
};

export type AdoptMediaFileResult = {
  readonly assetPath: string;
  readonly mediaPath: string;
  readonly document: MediaAssetDocument;
};

function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

function checkCancelled(context: MediaAdoptionContext): void {
  context.signal?.throwIfAborted();
}

function report(
  context: MediaAdoptionContext,
  stage: import("../index.js").MediaAdoptionProgress["stage"],
  source: string,
  target?: string,
): void {
  context.progress?.({ stage, source, ...(target === undefined ? {} : { target }) });
}

function portableRelative(base: string, target: string): string {
  const local = relative(base, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`Media file ${target} must lie below its Media Asset document directory.`);
  }
  return local.split(sep).join("/");
}

export async function adoptMediaFile(
  request: AdoptMediaFileRequest,
  host: AdoptMediaFileHost,
  context: MediaAdoptionContext = {},
): Promise<AdoptMediaFileResult> {
  const policy = request.filePolicy ?? "copy";
  if (policy !== "copy" && policy !== "link") throw new Error(`Media adoption policy ${String(policy)} is invalid.`);
  const source = resolve(request.sourcePath);
  const asset = resolve(request.assetPath);
  const base = dirname(asset);
  const sourceInfo = await stat(source).catch(() => undefined);
  if (sourceInfo?.isFile() !== true) throw new Error(`Media adoption source ${source} is not a readable file.`);
  if (await exists(asset)) throw new Error(`Media Asset document ${asset} already exists.`);

  checkCancelled(context);
  report(context, "inspect", source);
  const inspection = await host.inspect(source, context);
  checkCancelled(context);
  report(context, "interpret", source);
  const selection = selectMediaStreams(inspection, host.select(inspection));
  const interpretation = interpretMedia({ mediaType: request.mediaType, inspection, selection });

  const declaredPath = policy === "link"
    ? portableRelative(base, source)
    : request.mediaFile ?? basename(source);
  const mediaPath = resolve(base, declaredPath);
  const canonical = portableRelative(base, mediaPath);
  if (canonical !== declaredPath.replace(/^\.\//u, "")) {
    throw new Error(`Media adoption file ${declaredPath} is not a canonical portable relative path.`);
  }
  const file: MediaAssetFile = { path: canonical, mediaType: request.mediaType };

  let document: MediaAssetDocument;
  let createdMedia = false;
  try {
    if (policy === "copy" && mediaPath !== source) {
      if (await exists(mediaPath)) throw new Error(`Media adoption destination ${mediaPath} already exists.`);
      checkCancelled(context);
      report(context, "copy", source, mediaPath);
      await mkdir(dirname(mediaPath), { recursive: true });
      const temporaryDirectory = await mkdtemp(join(dirname(mediaPath), ".hypit-media-adopt-"));
      const temporary = join(temporaryDirectory, basename(mediaPath));
      try {
        await copyFile(source, temporary);
        checkCancelled(context);
        await link(temporary, mediaPath);
        createdMedia = true;
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
    checkCancelled(context);
    report(context, "publish", source, asset);
    document = createMediaAssetDocument({ file, interpretation, adoptedAt: new Date().toISOString() });
    await writeMediaAssetDocumentFile(asset, document);
  } catch (error) {
    if (createdMedia) await rm(mediaPath, { force: true });
    throw error;
  }
  report(context, "complete", source, asset);
  return { assetPath: asset, mediaPath, document };
}

import { copyFile, link, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  createMediaAssetDocumentFromInspection,
  verifyMediaAssetReference,
} from "../index.js";
import type {
  MediaAssetDocument,
  MediaAssetImportTaskContext,
} from "../index.js";
import { writeMediaAssetDocumentFile } from "./store.js";

export type NodeMediaAssetImportRequest = {
  readonly sourcePath: string;
  readonly assetPath: string;
  readonly id: string;
  readonly mediaType: string;
  /** Copy is portable; link requires the source to already live below the manifest directory. */
  readonly filePolicy: "copy" | "link";
  /** Portable path below the manifest directory. Defaults to the source basename for copy. */
  readonly mediaFile?: string;
};

export type NodeMediaAssetImportHost = {
  readonly inspect: (
    path: string,
    context: MediaAssetImportTaskContext,
  ) => import("@hypit/media").MediaInspection | Promise<import("@hypit/media").MediaInspection>;
  readonly select: (
    inspection: import("@hypit/media").MediaInspection,
  ) => import("@hypit/media").MediaSelectionRequest;
};

export type NodeMediaAssetImportResult = {
  readonly assetPath: string;
  readonly mediaPath: string;
  readonly document: MediaAssetDocument;
};

function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

function checkCancelled(context: MediaAssetImportTaskContext): void {
  context.signal?.throwIfAborted();
}

function report(
  context: MediaAssetImportTaskContext,
  stage: import("../index.js").MediaAssetImportProgress["stage"],
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

/**
 * One foreground/background task: inspect, interpret, optionally copy and atomically publish a manifest.
 * Scheduling, retries and persistence remain Host policy.
 */
export async function importMediaAssetFile(
  request: NodeMediaAssetImportRequest,
  host: NodeMediaAssetImportHost,
  context: MediaAssetImportTaskContext = {},
): Promise<NodeMediaAssetImportResult> {
  if (request.filePolicy !== "copy" && request.filePolicy !== "link") {
    throw new Error(`Media import file policy ${String(request.filePolicy)} is invalid.`);
  }
  if (!/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(request.id)) {
    throw new Error(`Media import id ${JSON.stringify(request.id)} is invalid.`);
  }
  if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(request.mediaType)) {
    throw new Error(`Media import media type ${JSON.stringify(request.mediaType)} is invalid.`);
  }
  const source = resolve(request.sourcePath);
  const asset = resolve(request.assetPath);
  const base = dirname(asset);
  const sourceInfo = await stat(source).catch(() => undefined);
  if (sourceInfo?.isFile() !== true) throw new Error(`Media import source ${source} is not a readable file.`);
  if (await exists(asset)) throw new Error(`Media Asset document ${asset} already exists.`);

  checkCancelled(context);
  report(context, "inspect", source);
  const inspection = await host.inspect(source, context);
  checkCancelled(context);
  report(context, "interpret", source);
  const selection = host.select(inspection);

  let filePath: string;
  if (request.filePolicy === "link") {
    filePath = portableRelative(base, source);
    verifyMediaAssetReference({ path: filePath });
  } else {
    filePath = request.mediaFile ?? basename(source);
    verifyMediaAssetReference({ path: filePath });
  }
  const mediaPath = resolve(base, filePath);
  if (portableRelative(base, mediaPath) !== filePath.replace(/^\.\//u, "")) {
    throw new Error(`Media import file ${filePath} is not a canonical portable relative path.`);
  }

  const document = createMediaAssetDocumentFromInspection({
    id: request.id,
    file: { path: filePath, mediaType: request.mediaType },
    inspection,
    selection,
  });

  let createdMedia = false;
  try {
    if (request.filePolicy === "copy" && mediaPath !== source) {
      if (await exists(mediaPath)) throw new Error(`Media import destination ${mediaPath} already exists.`);
      checkCancelled(context);
      report(context, "copy", source, mediaPath);
      await mkdir(dirname(mediaPath), { recursive: true });
      const temporaryDirectory = await mkdtemp(join(dirname(mediaPath), ".hypit-media-import-"));
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
    await writeMediaAssetDocumentFile(asset, document);
  } catch (error) {
    if (createdMedia) await rm(mediaPath, { force: true });
    throw error;
  }
  report(context, "complete", source, asset);
  return { assetPath: asset, mediaPath, document };
}

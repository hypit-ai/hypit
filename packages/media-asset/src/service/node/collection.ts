import { createHash } from "node:crypto";
import { link, lstat, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { mediaPictureExtent, type ResolvedMedia } from "@hypit/media";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import {
  readMediaAssetDocumentFile,
  resolveMediaAssetMediaFile,
} from "../../node/index.js";
import {
  type MediaAssetDocument,
  type MediaAssetReference,
  parseMediaAssetDocument,
  serializeMediaAssetDocument,
  verifyMediaAssetReference,
} from "../../index.js";
import type {
  ProjectMediaCatalogEntry,
  ProjectMediaCollectionAdapter,
  ProjectMediaResourceResolver,
} from "../index.js";
import { nodeMediaLibraryFile } from "./library-file.js";

function portable(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, target: string, label: string): string {
  const local = relative(root, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)) {
    throw new Error(`${label} leaves the Project Boundary.`);
  }
  return target;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function manifestPaths(directory: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" && current === directory) return [];
      throw error;
    });
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".media.json")) result.push(path);
    }
  };
  await visit(directory);
  return result.sort((left, right) => left.localeCompare(right));
}

function duration(document: MediaAssetDocument): ExactTemporalValue | undefined {
  return document.media.interpretation.domain?.duration;
}

async function catalogEntry(root: string, manifest: string): Promise<ProjectMediaCatalogEntry> {
  const reference = { path: portable(relative(root, manifest)) } satisfies MediaAssetReference;
  try {
    const document = await readMediaAssetDocumentFile(manifest);
    const primary = resolve(dirname(manifest), document.media.file.path);
    const file = await stat(primary, { bigint: true }).catch(() => undefined);
    const available = file?.isFile() === true;
    const picture = document.media.interpretation.picture;
    const audio = document.media.interpretation.audio;
    const source = available && file !== undefined ? [file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].join(":") : undefined;
    const version = (interpretation: NonNullable<typeof picture | typeof audio>) => createHash("sha256")
      .update(JSON.stringify([source, interpretation, duration(document)])).digest("hex");
    const extent = picture === undefined ? undefined : mediaPictureExtent(picture);
    const fileExtension = extname(document.media.file.path);
    return {
      state: available ? "available" : "missing",
      reference,
      mediaType: document.media.file.mediaType,
      adoptedAt: document.media.adoptedAt,
      ...(document.media.displayName === undefined ? {} : { displayName: document.media.displayName }),
      ...(fileExtension.length > 1 ? { fileExtension } : {}),
      ...(duration(document) === undefined ? {} : { duration: structuredClone(duration(document)!) }),
      ...(picture === undefined || extent === undefined ? {} : {
        picture: {
          kind: picture.kind,
          displayAspectRatio: extent.widthPx / extent.heightPx,
          ...(source === undefined ? {} : { version: version(picture) }),
          codedWidth: picture.interpretation.codedWidth,
          codedHeight: picture.interpretation.codedHeight,
          rotationDegrees: picture.interpretation.rotationDegrees,
        },
      }),
      audio: audio !== undefined,
      ...(source === undefined || audio === undefined ? {} : { audioVersion: version(audio) }),
      ...(available ? {} : { diagnostic: `Primary media file ${document.media.file.path} is missing.` }),
    };
  } catch (error) {
    return { state: "invalid", reference, diagnostic: errorMessage(error) };
  }
}

export type NodeProjectMediaCollectionOptions = {
  readonly root: string;
  readonly directory?: string;
};

export function createNodeProjectMediaCollection(
  options: NodeProjectMediaCollectionOptions,
): ProjectMediaCollectionAdapter {
  const root = resolve(options.root);
  const directoryName = options.directory ?? "media";
  if (directoryName.length === 0 || directoryName.includes("\\") || directoryName.startsWith("/")
    || directoryName.split("/").some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error("Project Media collection directory must be a portable project-relative path.");
  }
  const directory = inside(root, resolve(root, directoryName), "Project Media collection");
  const manifest = (reference: MediaAssetReference): string => {
    verifyMediaAssetReference(reference);
    const target = inside(root, resolve(root, reference.path), `Media Asset ${reference.path}`);
    const local = relative(directory, target);
    if (local === "" || local === ".." || local.startsWith(`..${sep}`)) {
      throw new Error(`Media Asset ${reference.path} is outside the Project Media collection.`);
    }
    return target;
  };
  const editableManifest = async (reference: MediaAssetReference): Promise<string | undefined> => {
    const target = manifest(reference);
    const information = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (information === undefined) return undefined;
    if (!information.isFile() || await realpath(target) !== target) {
      throw new Error(`Media Asset ${reference.path} must be a regular file in the Project Media collection.`);
    }
    return target;
  };
  return {
    ...nodeMediaLibraryFile(directory),
    async scan() {
      const paths = await manifestPaths(directory);
      return await Promise.all(paths.map(async (path) => await catalogEntry(root, path)));
    },
    async open(reference) {
      return await readMediaAssetDocumentFile(manifest(reference));
    },
    async renameAsset(reference, displayName) {
      const target = await editableManifest(reference);
      if (target === undefined) throw new Error(`Media Asset ${reference.path} has no manifest.`);
      const contents = await readFile(target, "utf8");
      const document = parseMediaAssetDocument(contents);
      if (document.media.displayName === displayName) return false;
      const staging = await mkdtemp(join(dirname(target), ".hypit-media-rename-"));
      const staged = join(staging, "manifest");
      try {
        await writeFile(staged, serializeMediaAssetDocument({ ...document, media: { ...document.media, displayName } }), { flag: "wx" });
        if (await editableManifest(reference) !== target || await readFile(target, "utf8") !== contents) {
          throw new Error(`Media Asset ${reference.path} changed during rename.`);
        }
        await rename(staged, target);
      } finally { await rm(staging, { recursive: true, force: true }); }
      return true;
    },
    async stageAssetRemoval(reference) {
      const target = await editableManifest(reference);
      if (target === undefined) return undefined;
      const staging = await mkdtemp(join(dirname(target), ".hypit-media-remove-"));
      const staged = join(staging, "manifest");
      try { await rename(target, staged); }
      catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw error;
      }
      const discard = async () => { await rm(staging, { recursive: true, force: true }); };
      return {
        async restore() {
          await link(staged, target);
          await discard();
        },
        discard,
      };
    },
    async resolveMedia(reference, resolver: ProjectMediaResourceResolver): Promise<ResolvedMedia> {
      return await resolveMediaAssetMediaFile(manifest(reference), resolver);
    },
  };
}

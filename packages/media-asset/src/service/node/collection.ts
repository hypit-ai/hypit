import { readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { ResolvedMedia } from "@hypit/media";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import {
  readMediaAssetDocumentFile,
  resolveMediaAssetMediaFile,
} from "../../node/index.js";
import {
  type MediaAssetDocument,
  type MediaAssetReference,
  verifyMediaAssetReference,
} from "../../index.js";
import type {
  ProjectMediaCatalogEntry,
  ProjectMediaCollectionAdapter,
  ProjectMediaResourceResolver,
} from "../index.js";

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
    const available = await stat(primary).then((value) => value.isFile(), () => false);
    const picture = document.media.interpretation.picture;
    return {
      state: available ? "available" : "missing",
      reference,
      mediaType: document.media.file.mediaType,
      ...(duration(document) === undefined ? {} : { duration: structuredClone(duration(document)!) }),
      ...(picture === undefined ? {} : {
        picture: {
          kind: picture.kind,
          codedWidth: picture.interpretation.codedWidth,
          codedHeight: picture.interpretation.codedHeight,
          rotationDegrees: picture.interpretation.rotationDegrees,
        },
      }),
      audio: document.media.interpretation.audio !== undefined,
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
  return {
    async scan() {
      const paths = await manifestPaths(directory);
      return await Promise.all(paths.map(async (path) => await catalogEntry(root, path)));
    },
    async open(reference) {
      return await readMediaAssetDocumentFile(manifest(reference));
    },
    async resolveMedia(reference, resolver: ProjectMediaResourceResolver): Promise<ResolvedMedia> {
      return await resolveMediaAssetMediaFile(manifest(reference), resolver);
    },
  };
}

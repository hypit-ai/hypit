import { readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { MediaAssetDocument } from "@hypit/media-asset";
import { readMediaAssetDocumentFile } from "@hypit/media-asset/node";
import type { NleItem, NleProject } from "@hypit/nle";

import type { NleWorkbenchProjectMediaView, WorkbenchProjectMediaView } from "../protocol.js";
import { portableRelative, projectMember, projectReference } from "./project-path.js";

export type ProjectMediaLibraryResource = {
  readonly file: string;
  readonly mediaType: string;
  readonly size: number;
};

export type ProjectMediaLibraryMaterialization = {
  readonly asset: string;
  readonly document: MediaAssetDocument;
};

export type NleMediaLibraryView = {
  readonly generation: number;
  readonly assets: readonly NleWorkbenchProjectMediaView[];
};

export type ProjectMediaLibraryView = {
  readonly generation: number;
  readonly assets: readonly WorkbenchProjectMediaView[];
};

type CachedMedia = {
  readonly id: string;
  readonly manifest: string;
  readonly view: WorkbenchProjectMediaView;
  readonly document?: MediaAssetDocument;
  readonly resource?: ProjectMediaLibraryResource;
};

type Projection = {
  readonly generation: number;
  readonly assets: readonly CachedMedia[];
  readonly byId: ReadonlyMap<string, CachedMedia>;
};

function ownedFile(base: string, path: string, label: string): string {
  const target = resolve(base, path);
  const local = relative(base, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)
    || isAbsolute(local) || resolve(base, local) !== target) {
    throw new Error(`${label} ${path} leaves ${base}.`);
  }
  return target;
}

function seconds(value: { readonly ticks: string; readonly timeBase: {
  readonly numerator: number; readonly denominator: number;
} }): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function displayExtent(picture: NonNullable<MediaAssetDocument["media"]["interpretation"]["picture"]>): {
  readonly width: number; readonly height: number;
} {
  const interpretation = picture.interpretation;
  let width = interpretation.codedWidth
    * interpretation.sampleAspectRatio.numerator / interpretation.sampleAspectRatio.denominator;
  let height = interpretation.codedHeight;
  if (interpretation.rotationDegrees === 90 || interpretation.rotationDegrees === 270) {
    [width, height] = [height, width];
  }
  return { width: Math.round(width), height: Math.round(height) };
}

function mediaUses(
  items: readonly NleItem[],
  projectRoot: string,
  projectFile: string,
  manifest: string,
): number {
  return items.reduce((count, item) => {
    let direct = 0;
    if (item.kind === "present" && item.source === "media") {
      try {
        direct = projectReference(projectRoot, projectFile, item.asset.path,
          `NLE Item ${item.id} Media Asset`) === manifest ? 1 : 0;
      } catch {
        direct = 0;
      }
    }
    return count + direct + (item.kind === "present" && item.source === "composition"
      ? item.composition.tracks.reduce((total, track) => total
        + mediaUses(track.items, projectRoot, projectFile, manifest), 0)
      : 0);
  }, 0);
}

async function mediaAssetFiles(directory: string): Promise<readonly string[]> {
  const result: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    await Promise.all(entries.map(async (entry) => {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".media.json")) result.push(path);
    }));
  };
  await visit(directory);
  return result.sort();
}

/** Explicit, application-scoped projection of `<projectRoot>/media`. */
export class ProjectMediaLibrary {
  readonly #projectRoot: string;
  readonly #referenceFile: string;
  readonly #resourcePrefix: string;
  #projection: Projection | undefined;
  #refreshing: Promise<void> | undefined;

  constructor(projectRoot: string, referenceFile: string, resourcePrefix: string) {
    this.#projectRoot = resolve(projectRoot);
    this.#referenceFile = projectMember(this.#projectRoot, referenceFile, "Project document");
    this.#resourcePrefix = resourcePrefix;
  }

  get generation(): number | undefined {
    return this.#projection?.generation;
  }

  async refresh(): Promise<void> {
    if (this.#refreshing !== undefined) return await this.#refreshing;
    const pending = this.#build();
    this.#refreshing = pending;
    try {
      await pending;
    } finally {
      if (this.#refreshing === pending) this.#refreshing = undefined;
    }
  }

  async #build(): Promise<void> {
    const generation = (this.#projection?.generation ?? 0) + 1;
    const manifests = await mediaAssetFiles(join(this.#projectRoot, "media"));
    const assets = await Promise.all(manifests.map(async (manifest): Promise<CachedMedia> => {
      const id = portableRelative(this.#projectRoot, manifest);
      const asset = portableRelative(dirname(this.#referenceFile), manifest);
      const fallbackName = manifest.split(sep).at(-1)!.replace(/\.media\.json$/u, "");
      try {
        const document = await readMediaAssetDocumentFile(manifest);
        const file = ownedFile(dirname(manifest), document.media.file.path, `Media Asset ${document.id} file`);
        const fileStat = await stat(file);
        if (!fileStat.isFile()) throw new Error(`${file} is not a file.`);
        const interpretation = document.media.interpretation;
        const picture = interpretation.picture;
        const kind = picture === undefined ? "audio" as const
          : picture.kind === "constant" ? "image" as const : "video" as const;
        const extent = picture === undefined ? undefined : displayExtent(picture);
        const resource = `${this.#resourcePrefix}/${encodeURIComponent(id)}?generation=${generation}`;
        return {
          id,
          manifest,
          document,
          resource: { file, mediaType: document.media.file.mediaType, size: fileStat.size },
          view: {
            id,
            name: document.id,
            asset,
            kind,
            mediaType: document.media.file.mediaType,
            size: fileStat.size,
            ...(interpretation.domain === undefined ? {} : { durationSeconds: seconds(interpretation.domain.duration) }),
            ...(extent === undefined ? {} : extent),
            hasAudio: interpretation.audio !== undefined,
            resource,
          },
        };
      } catch (error) {
        return {
          id,
          manifest,
          view: {
            id,
            name: fallbackName,
            asset,
            kind: "unknown",
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }));
    this.#projection = { generation, assets, byId: new Map(assets.map((asset) => [asset.id, asset])) };
  }

  async #current(): Promise<Projection> {
    if (this.#projection === undefined) await this.refresh();
    return this.#projection!;
  }

  async view(): Promise<ProjectMediaLibraryView> {
    const projection = await this.#current();
    return {
      generation: projection.generation,
      assets: projection.assets.map((asset) => structuredClone(asset.view)),
    };
  }

  resource(id: string): ProjectMediaLibraryResource | undefined {
    const value = this.#projection?.byId.get(id)?.resource;
    return value === undefined ? undefined : { ...value };
  }

  materialization(id: string): ProjectMediaLibraryMaterialization | undefined {
    const value = this.#projection?.byId.get(id);
    return value?.document === undefined
      ? undefined
      : { asset: value.view.asset, document: structuredClone(value.document) };
  }
}

/** NLE-specific usage projection over the shared project Media Asset catalog. */
export class NleMediaLibrary {
  readonly #projectRoot: string;
  readonly #projectFile: string;
  readonly #library: ProjectMediaLibrary;

  constructor(projectRoot: string, projectFile: string) {
    this.#projectRoot = resolve(projectRoot);
    this.#projectFile = projectMember(this.#projectRoot, projectFile, "NLE Project");
    this.#library = new ProjectMediaLibrary(
      this.#projectRoot, this.#projectFile, "/api/nle/media-resource",
    );
  }

  get generation(): number | undefined { return this.#library.generation; }

  async refresh(): Promise<void> { await this.#library.refresh(); }

  async view(project: NleProject): Promise<NleMediaLibraryView> {
    const projection = await this.#library.view();
    return {
      generation: projection.generation,
      assets: projection.assets.map((asset) => {
        let manifest: string | undefined;
        try {
          manifest = projectReference(this.#projectRoot, this.#projectFile, asset.asset,
            `NLE Media Asset ${asset.id}`);
        } catch {
          manifest = undefined;
        }
        return {
          ...asset,
          usedBy: manifest === undefined ? 0 : project.tracks.reduce((total, track) => total
            + mediaUses(track.items, this.#projectRoot, this.#projectFile, manifest!), 0),
        };
      }),
    };
  }

  resource(id: string): ProjectMediaLibraryResource | undefined { return this.#library.resource(id); }

  materialization(id: string): ProjectMediaLibraryMaterialization | undefined {
    return this.#library.materialization(id);
  }
}

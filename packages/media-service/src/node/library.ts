import { dirname, resolve } from "node:path";

import { mediaAssetDocumentFormat, type MediaAssetDocument } from "@hypit/media-asset";
import { projectObjectRef } from "@hypit/project";
import type { NodeProjectMediaService, ProjectMediaFileResource } from "./types.js";

import { portableRelative, projectMember } from "@hypit/project/node";

export type ProjectMediaLibraryResource = ProjectMediaFileResource;

export type ProjectMediaLibraryMaterialization = {
  readonly asset: string;
  readonly document: MediaAssetDocument;
};

export type ProjectMediaLibraryAsset = {
  readonly id: string;
  readonly name: string;
  readonly asset: string;
  readonly kind: "image" | "video" | "audio" | "unknown";
  readonly mediaType?: string;
  readonly size?: number;
  readonly durationSeconds?: number;
  readonly width?: number;
  readonly height?: number;
  readonly hasAudio?: boolean;
  readonly resource?: string;
  readonly error?: string;
};

export type ProjectMediaLibraryView = {
  readonly generation: number;
  readonly assets: readonly ProjectMediaLibraryAsset[];
};

/** Consumer-relative projection over one project-scoped Media Service. */
export class ProjectMediaLibrary {
  readonly #service: NodeProjectMediaService;
  readonly #referenceFile: string;
  readonly #resourceUrl: (id: string, generation: number) => string;

  constructor(
    service: NodeProjectMediaService,
    referenceFile: string,
    resource: string | ((id: string, generation: number) => string),
  ) {
    this.#service = service;
    this.#referenceFile = projectMember(service.projectRoot, referenceFile, "Project document");
    this.#resourceUrl = typeof resource === "string"
      ? (id, generation) => `${resource}/${encodeURIComponent(id)}?generation=${generation}`
      : resource;
  }

  get generation(): number | undefined {
    return this.#service.generation;
  }

  async refresh(): Promise<void> {
    await this.#service.refresh();
  }

  async view(): Promise<ProjectMediaLibraryView> {
    const catalog = await this.#service.observe();
    return {
      generation: catalog.generation,
      assets: catalog.assets.map((entry) => {
        const id = entry.ref.path;
        const manifest = resolve(this.#service.projectRoot, entry.ref.path);
        return {
          id,
          name: entry.name,
          asset: portableRelative(dirname(this.#referenceFile), manifest),
          kind: entry.kind,
          ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }),
          ...(entry.size === undefined ? {} : { size: entry.size }),
          ...(entry.durationSeconds === undefined ? {} : { durationSeconds: entry.durationSeconds }),
          ...(entry.width === undefined ? {} : { width: entry.width }),
          ...(entry.height === undefined ? {} : { height: entry.height }),
          ...(entry.hasAudio === undefined ? {} : { hasAudio: entry.hasAudio }),
          ...(entry.resourceAvailable ? {
            resource: this.#resourceUrl(id, catalog.generation),
          } : {}),
          ...(entry.error === undefined ? {} : { error: entry.error }),
        };
      }),
    };
  }

  resource(id: string): ProjectMediaLibraryResource | undefined {
    return this.#service.resource(projectObjectRef(id, mediaAssetDocumentFormat));
  }

  materialization(id: string): ProjectMediaLibraryMaterialization | undefined {
    const value = this.#service.materialization(projectObjectRef(id, mediaAssetDocumentFormat));
    if (value === undefined) return undefined;
    const manifest = resolve(this.#service.projectRoot, value.ref.path);
    return {
      asset: portableRelative(dirname(this.#referenceFile), manifest),
      document: value.document,
    };
  }
}

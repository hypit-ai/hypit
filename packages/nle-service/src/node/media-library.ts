import {
  ProjectMediaLibrary,
  type NodeProjectMediaService,
  type ProjectMediaLibraryMaterialization,
  type ProjectMediaLibraryResource,
} from "@hypit/media-service/node";

import type { NleServiceProjectMediaView } from "../protocol.js";

export type NleMediaLibraryView = {
  readonly generation: number;
  readonly assets: readonly NleServiceProjectMediaView[];
};

/** NLE-relative projection over the one project-scoped Media Service. */
export class NleMediaLibrary {
  readonly #library: ProjectMediaLibrary;

  constructor(
    service: NodeProjectMediaService,
    projectFile: string,
    resourceUrl: (id: string, generation: number) => string,
  ) {
    this.#library = new ProjectMediaLibrary(service, projectFile, resourceUrl);
  }

  get generation(): number | undefined { return this.#library.generation; }

  async refresh(): Promise<void> { await this.#library.refresh(); }

  async view(): Promise<NleMediaLibraryView> {
    const projection = await this.#library.view();
    return { generation: projection.generation, assets: projection.assets };
  }

  resource(id: string): ProjectMediaLibraryResource | undefined { return this.#library.resource(id); }

  materialization(id: string): ProjectMediaLibraryMaterialization | undefined {
    return this.#library.materialization(id);
  }
}

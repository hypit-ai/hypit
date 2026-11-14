import { resolve } from "node:path";

import {
  createProjectBenchFacet,
  type ProjectBench,
  type ProjectBenchFacet,
  type ProjectBenchRequest,
} from "@hypit/bench";
import { generationWorkspaceFormat } from "@hypit/generation-canvas";
import { nleProjectFormat } from "@hypit/nle";
import { sceneProjectFormat } from "@hypit/scene";
import {
  createNodeProjectMediaServicePool,
  type NodeProjectMediaServiceLease,
  type NodeProjectMediaServicePool,
} from "@hypit/media-service/node";

import { startGenerationCanvasWorkbenchServer } from "./canvas-server.js";
import { startSceneWorkbenchServer } from "./scene-server.js";
import { startWorkbenchServer } from "./server.js";

export const nleProjectBenchId = "hypit.nle-bench";
export const commentsProjectBenchId = "hypit.comments-bench";
export const sceneProjectBenchId = "hypit.scene-bench";
export const generationCanvasProjectBenchId = "hypit.generation-canvas-bench";

type NleBenchBackend = {
  readonly nleUrl: string;
  readonly commentsUrl: string;
  close(): void | Promise<void>;
};

type SceneBenchBackend = {
  readonly sceneUrl: string;
  close(): void | Promise<void>;
};

type CanvasBenchBackend = {
  readonly canvasUrl: string;
  close(): void | Promise<void>;
};

export type WorkbenchProjectBenchOpeners = {
  readonly openNle?: (request: ProjectBenchRequest) => Promise<NleBenchBackend>;
  readonly openScene?: (request: ProjectBenchRequest) => Promise<SceneBenchBackend>;
  readonly openCanvas?: (request: ProjectBenchRequest) => Promise<CanvasBenchBackend>;
  /** Shared invocation-local Project service composition for the default openers. */
  readonly media?: NodeProjectMediaServicePool;
};

function objectFile(request: ProjectBenchRequest): string {
  return resolve(request.projectRoot, request.object.path);
}

function title(kind: string, request: ProjectBenchRequest): string {
  return `${kind} · ${request.object.path.split("/").at(-1)}`;
}

async function leasedBackend<T extends { close(): void | Promise<void> }>(
  lease: NodeProjectMediaServiceLease,
  open: () => Promise<T>,
): Promise<T> {
  let backend: T;
  try {
    backend = await open();
  } catch (error) {
    await lease.release();
    throw error;
  }
  let closed = false;
  return {
    ...backend,
    async close() {
      if (closed) return;
      closed = true;
      try {
        await backend.close();
      } finally {
        await lease.release();
      }
    },
  };
}

async function openNle(
  request: ProjectBenchRequest,
  media: NodeProjectMediaServicePool,
): Promise<NleBenchBackend> {
  const lease = media.acquire(request.projectRoot);
  return await leasedBackend(lease, async () => await startWorkbenchServer({
    projectRoot: request.projectRoot,
    projectFile: objectFile(request),
    media: lease.service,
  }));
}

async function openScene(request: ProjectBenchRequest): Promise<SceneBenchBackend> {
  return await startSceneWorkbenchServer({
    projectRoot: request.projectRoot,
    projectFile: objectFile(request),
  });
}

async function openCanvas(
  request: ProjectBenchRequest,
  media: NodeProjectMediaServicePool,
): Promise<CanvasBenchBackend> {
  const lease = media.acquire(request.projectRoot);
  return await leasedBackend(lease, async () => await startGenerationCanvasWorkbenchServer({
    projectRoot: request.projectRoot,
    workspaceFile: objectFile(request),
    media: lease.service,
  }));
}

/** Independent work surfaces; the caller selects and arranges their returned sessions. */
export function createWorkbenchProjectBenches(
  options: WorkbenchProjectBenchOpeners = {},
): readonly ProjectBench[] {
  const media = options.media ?? createNodeProjectMediaServicePool();
  const nle = options.openNle ?? (async (request) => await openNle(request, media));
  const scene = options.openScene ?? openScene;
  const canvas = options.openCanvas ?? (async (request) => await openCanvas(request, media));
  return [{
    id: nleProjectBenchId,
    label: "Timeline",
    formats: [nleProjectFormat],
    async open(request) {
      const backend = await nle(request);
      return {
        title: title("Timeline", request),
        surface: { kind: "web", url: backend.nleUrl },
        close: async () => await backend.close(),
      };
    },
  }, {
    id: commentsProjectBenchId,
    label: "Comments",
    formats: [nleProjectFormat],
    async open(request) {
      const backend = await nle(request);
      return {
        title: title("Comments", request),
        surface: { kind: "web", url: backend.commentsUrl },
        close: async () => await backend.close(),
      };
    },
  }, {
    id: sceneProjectBenchId,
    label: "Scene",
    formats: [sceneProjectFormat],
    async open(request) {
      const backend = await scene(request);
      return {
        title: title("Scene", request),
        surface: { kind: "web", url: backend.sceneUrl },
        close: async () => await backend.close(),
      };
    },
  }, {
    id: generationCanvasProjectBenchId,
    label: "Canvas",
    formats: [generationWorkspaceFormat],
    async open(request) {
      const backend = await canvas(request);
      return {
        title: title("Canvas", request),
        surface: { kind: "web", url: backend.canvasUrl },
        close: async () => await backend.close(),
      };
    },
  }];
}

export function createWorkbenchProjectBenchFacets(
  options: WorkbenchProjectBenchOpeners = {},
): readonly ProjectBenchFacet[] {
  return createWorkbenchProjectBenches(options).map(createProjectBenchFacet);
}

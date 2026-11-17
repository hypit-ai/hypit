import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  openNodeProjectMediaService,
  type NodeProjectMediaService,
} from "@hypit/media-asset/service/node";
import {
  openProjectHost,
  openProjectResourceGateway,
  type ProjectExecutorClient,
  type ProjectHost,
} from "../index.js";
import { readNodeProjectManifest } from "./manifest.js";
import { loadNodeProjectPackageEnvironment } from "./packages.js";
import { createNodeProjectResourceResolver } from "./resources.js";

async function requireFile(path: string, label: string): Promise<void> {
  const information = await stat(path).catch(() => undefined);
  if (information?.isFile() !== true) throw new Error(`${label} is missing at ${path}.`);
}

export type OpenNodeProjectHostOptions = {
  readonly root: string;
  readonly executorClients?: readonly ProjectExecutorClient[];
};

export type NodeProjectHost = ProjectHost & {
  readonly media: NodeProjectMediaService;
};

export async function openNodeProjectHost(options: OpenNodeProjectHostOptions): Promise<NodeProjectHost> {
  const requested = resolve(options.root);
  const information = await stat(requested);
  if (!information.isDirectory()) throw new Error(`Project Boundary ${requested} is not a directory.`);
  const root = await realpath(requested);
  await requireFile(resolve(root, "package.json"), "Project package manifest");
  await requireFile(resolve(root, "pnpm-lock.yaml"), "Project package lockfile");
  const manifest = await readNodeProjectManifest(root);
  const packages = await loadNodeProjectPackageEnvironment(root, manifest);
  const media = openNodeProjectMediaService({ root });
  const resources = openProjectResourceGateway(media, createNodeProjectResourceResolver(root));
  return openProjectHost({
    boundary: { root, manifest },
    packages,
    media,
    resources,
    executorClients: options.executorClients ?? [],
  }) as NodeProjectHost;
}

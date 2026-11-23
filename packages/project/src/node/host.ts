import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProjectMediaViewExecutor } from "@hypit/media-asset/service";
import {
  openNodeProjectMediaService,
  type NodeProjectMediaService,
} from "@hypit/media-asset/service/node";
import {
  openProjectHost,
  openProjectResourceGateway,
  type ProjectExecutionClient,
  type ProjectExecutionDiscovery,
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
  readonly mediaViewExecutor?: (cacheDirectory: string) => ProjectMediaViewExecutor;
  readonly executionClients?: readonly ProjectExecutionClient[];
  readonly discoverExecutionClients?: ProjectExecutionDiscovery;
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
  const resolver = createNodeProjectResourceResolver(root);
  const executor = options.mediaViewExecutor?.(resolve(root, ".hypit/cache/media"));
  const media = openNodeProjectMediaService({ root, ...(executor === undefined ? {} : { previews: { resolver, executor } }) });
  const resources = openProjectResourceGateway(media, resolver);
  return openProjectHost({
    boundary: { root, manifest },
    packages,
    media,
    resources,
    executionClients: options.executionClients ?? [],
    ...(options.discoverExecutionClients === undefined ? {} : { discoverExecutionClients: options.discoverExecutionClients }),
  }) as NodeProjectHost;
}

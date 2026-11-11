import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { verifyPreparedMedia } from "@hypit/media";

import { assertNleComposition, assertNleProject } from "../project.js";
import type {
  NleComposition,
  NleMediaItem,
  NleMediaResolver,
  NleProject,
  NleResolvedMedia,
} from "../index.js";

export type NodeNleMediaOpener = (
  path: string,
  context: {
    readonly project: NleComposition;
    readonly item: NleMediaItem;
  },
) => NleResolvedMedia | Promise<NleResolvedMedia>;

/**
 * Open every Media Asset reference once before synchronous AVIR lowering.
 * Project parsing and editing remain independent from media availability.
 */
export async function createNodeNleMediaResolver(
  projectRoot: string,
  projectFile: string,
  project: NleProject,
  open: NodeNleMediaOpener,
): Promise<NleMediaResolver> {
  assertNleProject(project);
  const root = resolve(projectRoot);
  const file = resolve(projectFile);
  const projectLocal = relative(root, file);
  if (projectLocal === "" || projectLocal === ".." || projectLocal.startsWith(`..${sep}`)
    || isAbsolute(projectLocal) || resolve(root, projectLocal) !== file) {
    throw new Error(`NLE Project ${file} leaves the application Project Root ${root}.`);
  }
  const base = dirname(file);
  const resolved = new Map<NleComposition, Map<string, NleResolvedMedia>>();
  const paths = new Map<string, Promise<NleResolvedMedia>>();

  const visit = async (current: NleComposition, projectEnvelope = false): Promise<void> => {
    if (!projectEnvelope) assertNleComposition(current);
    let byAsset = resolved.get(current);
    if (byAsset === undefined) {
      byAsset = new Map();
      resolved.set(current, byAsset);
    }
    const mediaItems = current.tracks.flatMap((track) => track.items.filter((item): item is NleMediaItem =>
      item.kind === "present" && item.source === "media"));
    await Promise.all(mediaItems.map(async (item) => {
      const target = resolve(base, item.asset.path);
      const local = relative(root, target);
      if (local === "" || local === ".." || local.startsWith(`..${sep}`)
        || isAbsolute(local) || resolve(root, local) !== target) {
        throw new Error(`NLE Media Asset ${item.asset.path} leaves the application Project Root.`);
      }
      let pending = paths.get(target);
      if (pending === undefined) {
        pending = Promise.resolve(open(target, { project: current, item }));
        paths.set(target, pending);
      }
      const value = await pending;
      verifyPreparedMedia(value);
      byAsset!.set(item.asset.path, structuredClone(value));
    }));
    await Promise.all(current.tracks.flatMap((track) => track.items
      .filter((item) => item.kind === "present" && item.source === "composition")
      .map((item) => visit(item.composition))));
  };
  await visit(project, true);

  return (asset, context) => {
    const value = resolved.get(context.project)?.get(asset.path);
    if (value === undefined) {
      throw new Error(`NLE Media Asset ${asset.path} was not opened for Project ${context.project.id}.`);
    }
    return structuredClone(value);
  };
}

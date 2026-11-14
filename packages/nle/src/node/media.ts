import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { verifyPreparedMedia } from "@hypit/media";

import { assertNleComposition, assertNleProject } from "../project.js";
import type {
  NleComposition,
  NleMediaLoweringContext,
  NleMediaResolver,
  NleProject,
  NleResolvedMedia,
} from "../index.js";

export type NodeNleMediaOpener = (
  path: string,
  context: NleMediaLoweringContext,
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
    const uses = current.tracks.flatMap((track) => track.items.flatMap((item): readonly {
      readonly asset: import("../index.js").NleMediaAssetReference;
      readonly context: NleMediaLoweringContext;
    }[] => {
      if (item.kind !== "present") return [];
      if (item.source === "media") return [{
        asset: item.asset,
        context: { kind: "item", project: current, track, item },
      }];
      if (item.source !== "component") return [];
      return Object.entries(item.media ?? {}).map(([input, asset]) => ({
        asset,
        context: { kind: "component-input", project: current, track, item, input },
      }));
    }));
    await Promise.all(uses.map(async ({ asset, context }) => {
      const target = resolve(base, asset.path);
      const local = relative(root, target);
      if (local === "" || local === ".." || local.startsWith(`..${sep}`)
        || isAbsolute(local) || resolve(root, local) !== target) {
        throw new Error(`NLE Media Asset ${asset.path} leaves the application Project Root.`);
      }
      let pending = paths.get(target);
      if (pending === undefined) {
        pending = Promise.resolve(open(target, context));
        paths.set(target, pending);
      }
      const value = await pending;
      verifyPreparedMedia(value);
      byAsset!.set(asset.path, structuredClone(value));
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

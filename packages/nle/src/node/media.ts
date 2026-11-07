import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { verifyPreparedMedia } from "@hypit/media";

import { assertNleProject } from "../project.js";
import type { NleMediaResolver, NleProject, NleResolvedMedia } from "../index.js";

export type NodeNleMediaOpener = (
  path: string,
  context: {
    readonly project: NleProject;
    readonly media: NleProject["media"][number];
  },
) => NleResolvedMedia | Promise<NleResolvedMedia>;

/**
 * Open every Media Asset reference once before synchronous AVIR lowering.
 * Project parsing and editing remain independent from media availability.
 */
export async function createNodeNleMediaResolver(
  projectFile: string,
  project: NleProject,
  open: NodeNleMediaOpener,
): Promise<NleMediaResolver> {
  assertNleProject(project);
  const base = dirname(resolve(projectFile));
  const resolved = new Map<NleProject, Map<string, NleResolvedMedia>>();
  const paths = new Map<string, Promise<NleResolvedMedia>>();

  const visit = async (current: NleProject): Promise<void> => {
    let byMedia = resolved.get(current);
    if (byMedia === undefined) {
      byMedia = new Map();
      resolved.set(current, byMedia);
    }
    await Promise.all(current.media.map(async (media) => {
      const target = resolve(base, media.asset.path);
      const local = relative(base, target);
      if (local === "" || local === ".." || local.startsWith(`..${sep}`)
        || isAbsolute(local) || resolve(base, local) !== target) {
        throw new Error(`NLE Media Asset ${media.asset.path} leaves the Project directory.`);
      }
      let pending = paths.get(target);
      if (pending === undefined) {
        pending = Promise.resolve(open(target, { project: current, media }));
        paths.set(target, pending);
      }
      const value = await pending;
      verifyPreparedMedia(value);
      byMedia!.set(media.id, structuredClone(value));
    }));
    await Promise.all(current.tracks.flatMap((track) => track.items
      .filter((item) => item.kind === "compound")
      .map((item) => visit(item.project))));
  };
  await visit(project);

  return (media, context) => {
    const value = resolved.get(context.project)?.get(media.id);
    if (value === undefined) {
      throw new Error(`NLE Media ${media.id} was not opened for Project ${context.project.id}.`);
    }
    return structuredClone(value);
  };
}

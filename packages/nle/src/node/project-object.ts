import { readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { mediaAssetDocumentFormat } from "@hypit/media-asset";
import { projectObjectRef, type ProjectObjectRef } from "@hypit/project";
import {
  createProjectObjectOwnerFacet,
  type ProjectObjectObservation,
  type ProjectObjectOwner,
  type ProjectObjectOwnerFacet,
} from "@hypit/production-context";

import { nleProjectFormat, type NleComposition, type NleMediaItem } from "../types.js";
import { readNleProjectFile } from "./store.js";

const excludedDirectories = new Set([".git", ".hypit", "node_modules", "packages", "exports"]);

function portable(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, target: string): boolean {
  const local = relative(root, target);
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`)
    && !isAbsolute(local) && resolve(root, local) === target;
}

async function nleDocuments(projectRoot: string): Promise<readonly ProjectObjectRef[]> {
  const root = await realpath(resolve(projectRoot));
  const found: ProjectObjectRef[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".nle.json")) {
        found.push(projectObjectRef(portable(relative(root, path)), nleProjectFormat));
      }
    }
  };

  await visit(root);
  return found;
}

function mediaItems(composition: NleComposition): readonly NleMediaItem[] {
  const direct = composition.tracks.flatMap((track) => track.items.filter((item): item is NleMediaItem =>
    item.kind === "present" && item.source === "media"));
  const nested = composition.tracks.flatMap((track) => track.items
    .filter((item) => item.kind === "present" && item.source === "composition")
    .flatMap((item) => mediaItems(item.composition)));
  return [...direct, ...nested];
}

async function nleObservation(
  ref: ProjectObjectRef,
  projectRoot: string,
): Promise<ProjectObjectObservation> {
  const root = await realpath(resolve(projectRoot));
  const requested = resolve(root, ref.path);
  if (!inside(root, requested)) throw new Error(`NLE Project ${ref.path} leaves its Project Boundary.`);
  const path = await realpath(requested);
  if (!inside(root, path)) throw new Error(`NLE Project ${ref.path} resolves outside its Project Boundary.`);
  const project = (await readNleProjectFile(path)).current;
  const references = new Map<string, ProjectObjectRef>();
  for (const item of mediaItems(project)) {
    const target = resolve(dirname(path), item.asset.path);
    if (!inside(root, target)) {
      throw new Error(`NLE Media Asset ${item.asset.path} leaves its Project Boundary.`);
    }
    const reference = projectObjectRef(portable(relative(root, target)), mediaAssetDocumentFormat);
    references.set(reference.path, reference);
  }
  return {
    ref,
    label: project.name,
    references: [...references.values()],
  };
}

export function createNleProjectObjectOwner(): ProjectObjectOwner {
  return {
    format: nleProjectFormat,
    discover: async ({ projectRoot }) => await nleDocuments(projectRoot),
    observe: async (ref, { projectRoot }) => await nleObservation(ref, projectRoot),
  };
}

export function createNleProjectObjectOwnerFacet(): ProjectObjectOwnerFacet {
  return createProjectObjectOwnerFacet(createNleProjectObjectOwner());
}

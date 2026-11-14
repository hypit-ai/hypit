import { readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { projectObjectRef, type ProjectObjectRef } from "@hypit/project";
import {
  createProjectObjectOwnerFacet,
  type ProjectObjectObservation,
  type ProjectObjectOwner,
  type ProjectObjectOwnerFacet,
} from "@hypit/production-context";

import { parseSceneAssetDocument } from "../asset.js";
import { parseSceneLibraryDocument } from "../library.js";
import {
  sceneAssetFormat,
  sceneLibraryFormat,
  sceneProjectFormat,
} from "../types.js";
import { readSceneProjectFile } from "./store.js";

const excludedDirectories = new Set([".git", ".hypit", "node_modules", "packages", "exports"]);

function portable(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, target: string): boolean {
  const local = relative(root, target);
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`)
    && !isAbsolute(local) && resolve(root, local) === target;
}

async function existingObjectPath(projectRoot: string, ref: ProjectObjectRef): Promise<{
  readonly root: string;
  readonly path: string;
}> {
  const root = await realpath(resolve(projectRoot));
  const requested = resolve(root, ref.path);
  if (!inside(root, requested)) throw new Error(`Scene object ${ref.path} leaves its Project Boundary.`);
  const path = await realpath(requested);
  if (!inside(root, path)) throw new Error(`Scene object ${ref.path} resolves outside its Project Boundary.`);
  return { root, path };
}

function referencedObject(
  root: string,
  ownerPath: string,
  path: string,
  format: string,
): ProjectObjectRef {
  const target = resolve(dirname(ownerPath), path);
  if (!inside(root, target)) throw new Error(`Scene reference ${path} leaves its Project Boundary.`);
  return projectObjectRef(portable(relative(root, target)), format);
}

async function scan(
  projectRoot: string,
  directory: string,
  suffix: string,
  format: string,
): Promise<readonly ProjectObjectRef[]> {
  const root = await realpath(resolve(projectRoot));
  const start = resolve(root, directory);
  if (start !== root && !inside(root, start)) throw new Error(`Scene discovery leaves its Project Boundary.`);
  const found: ProjectObjectRef[] = [];

  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true }).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith(suffix)) {
        found.push(projectObjectRef(portable(relative(root, path)), format));
      }
    }
  };

  await visit(start);
  return found;
}

function sceneProjectOwner(): ProjectObjectOwner {
  return {
    format: sceneProjectFormat,
    discover: async ({ projectRoot }) => await scan(projectRoot, ".", ".scene.json", sceneProjectFormat),
    async observe(ref, { projectRoot }) {
      const { root, path } = await existingObjectPath(projectRoot, ref);
      const project = (await readSceneProjectFile(path)).current;
      return {
        ref,
        label: project.name,
        references: project.libraries.map((library) =>
          referencedObject(root, path, library.path, sceneLibraryFormat)),
      } satisfies ProjectObjectObservation;
    },
  };
}

function sceneLibraryOwner(): ProjectObjectOwner {
  return {
    format: sceneLibraryFormat,
    discover: async ({ projectRoot }) =>
      await scan(projectRoot, "scenes", ".scene-library.json", sceneLibraryFormat),
    async observe(ref, { projectRoot }) {
      const { root, path } = await existingObjectPath(projectRoot, ref);
      const library = parseSceneLibraryDocument(await readFile(path, "utf8"));
      return {
        ref,
        label: library.name,
        references: library.entries.map((entry) =>
          referencedObject(root, path, entry.asset.path, sceneAssetFormat)),
      } satisfies ProjectObjectObservation;
    },
  };
}

function sceneAssetOwner(): ProjectObjectOwner {
  return {
    format: sceneAssetFormat,
    discover: async ({ projectRoot }) =>
      await scan(projectRoot, "scenes/assets", ".scene-asset.json", sceneAssetFormat),
    async observe(ref, { projectRoot }) {
      const { path } = await existingObjectPath(projectRoot, ref);
      const asset = parseSceneAssetDocument(await readFile(path, "utf8"));
      return { ref, label: asset.name, references: [] } satisfies ProjectObjectObservation;
    },
  };
}

export function createSceneProjectObjectOwners(): readonly ProjectObjectOwner[] {
  return [sceneProjectOwner(), sceneLibraryOwner(), sceneAssetOwner()];
}

export function createSceneProjectObjectOwnerFacets(): readonly ProjectObjectOwnerFacet[] {
  return createSceneProjectObjectOwners().map(createProjectObjectOwnerFacet);
}

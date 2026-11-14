import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { projectObjectRef, type ProjectObjectRef } from "@hypit/project";
import {
  createProjectObjectOwnerFacet,
  type ProjectObjectObservation,
  type ProjectObjectOwner,
  type ProjectObjectOwnerFacet,
} from "@hypit/production-context";

import { generationGraphFormat } from "../types.js";
import { readGenerationGraphProjectFile } from "./store.js";

const excludedDirectories = new Set([".git", ".hypit", "node_modules", "packages", "exports"]);

function portable(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, target: string): boolean {
  const local = relative(root, target);
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`)
    && !isAbsolute(local) && resolve(root, local) === target;
}

async function graphDocuments(projectRoot: string): Promise<readonly ProjectObjectRef[]> {
  const root = await realpath(resolve(projectRoot));
  const found: ProjectObjectRef[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".graph.json")) {
        found.push(projectObjectRef(portable(relative(root, path)), generationGraphFormat));
      }
    }
  };
  await visit(root);
  return found;
}

async function graphObservation(
  ref: ProjectObjectRef,
  projectRoot: string,
): Promise<ProjectObjectObservation> {
  const root = await realpath(resolve(projectRoot));
  const requested = resolve(root, ref.path);
  if (!inside(root, requested)) throw new Error(`Generation Graph ${ref.path} leaves its Project Boundary.`);
  const path = await realpath(requested);
  if (!inside(root, path)) throw new Error(`Generation Graph ${ref.path} resolves outside its Project Boundary.`);
  const graph = await readGenerationGraphProjectFile(path);
  return { ref, label: graph.name, references: [] };
}

export function createGenerationGraphProjectObjectOwner(): ProjectObjectOwner {
  return {
    format: generationGraphFormat,
    discover: async ({ projectRoot }) => await graphDocuments(projectRoot),
    observe: async (ref, { projectRoot }) => await graphObservation(ref, projectRoot),
  };
}

export function createGenerationGraphProjectObjectOwnerFacet(): ProjectObjectOwnerFacet {
  return createProjectObjectOwnerFacet(createGenerationGraphProjectObjectOwner());
}

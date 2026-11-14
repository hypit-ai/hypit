import { readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { generationGraphFormat } from "@hypit/generation-graph";
import { projectObjectRef, type ProjectObjectRef } from "@hypit/project";
import {
  createProjectObjectOwnerFacet,
  type ProjectObjectObservation,
  type ProjectObjectOwner,
  type ProjectObjectOwnerFacet,
} from "@hypit/production-context";

import { generationWorkspaceFormat } from "../types.js";
import { readGenerationWorkspaceFile } from "./store.js";

const excludedDirectories = new Set([".git", ".hypit", "node_modules", "packages", "exports"]);

function portable(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, target: string): boolean {
  const local = relative(root, target);
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`)
    && !isAbsolute(local) && resolve(root, local) === target;
}

async function workspaceDocuments(projectRoot: string): Promise<readonly ProjectObjectRef[]> {
  const root = await realpath(resolve(projectRoot));
  const found: ProjectObjectRef[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && !excludedDirectories.has(entry.name)) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".workspace.json")) {
        found.push(projectObjectRef(portable(relative(root, path)), generationWorkspaceFormat));
      }
    }
  };
  await visit(root);
  return found;
}

async function workspaceObservation(
  ref: ProjectObjectRef,
  projectRoot: string,
): Promise<ProjectObjectObservation> {
  const root = await realpath(resolve(projectRoot));
  const requested = resolve(root, ref.path);
  if (!inside(root, requested)) throw new Error(`Generation Workspace ${ref.path} leaves its Project Boundary.`);
  const path = await realpath(requested);
  if (!inside(root, path)) throw new Error(`Generation Workspace ${ref.path} resolves outside its Project Boundary.`);
  const workspace = await readGenerationWorkspaceFile(path);
  const graph = resolve(dirname(path), workspace.graph.path);
  if (!inside(root, graph)) {
    throw new Error(`Generation Workspace Graph ${workspace.graph.path} leaves its Project Boundary.`);
  }
  return {
    ref,
    label: workspace.name,
    references: [projectObjectRef(portable(relative(root, graph)), generationGraphFormat)],
  };
}

export function createGenerationWorkspaceProjectObjectOwner(): ProjectObjectOwner {
  return {
    format: generationWorkspaceFormat,
    discover: async ({ projectRoot }) => await workspaceDocuments(projectRoot),
    observe: async (ref, { projectRoot }) => await workspaceObservation(ref, projectRoot),
  };
}

export function createGenerationWorkspaceProjectObjectOwnerFacet(): ProjectObjectOwnerFacet {
  return createProjectObjectOwnerFacet(createGenerationWorkspaceProjectObjectOwner());
}

import { readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { projectObjectRef, type ProjectObjectRef } from "@hypit/project";
import {
  createProjectObjectOwnerFacet,
  type ProjectObjectObservation,
  type ProjectObjectOwner,
  type ProjectObjectOwnerFacet,
} from "@hypit/production-context";

import { mediaAssetDocumentFormat } from "../types.js";
import { readMediaAssetDocumentFile } from "./store.js";

function portable(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, target: string): boolean {
  const local = relative(root, target);
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`)
    && !isAbsolute(local) && resolve(root, local) === target;
}

export async function discoverMediaAssetDocuments(projectRoot: string): Promise<readonly ProjectObjectRef[]> {
  const root = await realpath(resolve(projectRoot));
  const media = resolve(root, "media");
  const found: ProjectObjectRef[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".media.json")) {
        found.push(projectObjectRef(portable(relative(root, path)), mediaAssetDocumentFormat));
      }
    }
  };

  await visit(media);
  return found;
}

async function mediaObservation(
  ref: ProjectObjectRef,
  projectRoot: string,
): Promise<ProjectObjectObservation> {
  const root = await realpath(resolve(projectRoot));
  const requested = resolve(root, ref.path);
  if (!inside(root, requested)) throw new Error(`Media Asset ${ref.path} leaves its Project Boundary.`);
  const path = await realpath(requested);
  if (!inside(root, path)) throw new Error(`Media Asset ${ref.path} resolves outside its Project Boundary.`);
  const document = await readMediaAssetDocumentFile(path);
  return {
    ref,
    label: document.id,
    references: [],
  };
}

export function createMediaProjectObjectOwner(): ProjectObjectOwner {
  return {
    format: mediaAssetDocumentFormat,
    discover: async ({ projectRoot }) => await discoverMediaAssetDocuments(projectRoot),
    observe: async (ref, { projectRoot }) => await mediaObservation(ref, projectRoot),
  };
}

export function createMediaProjectObjectOwnerFacet(): ProjectObjectOwnerFacet {
  return createProjectObjectOwnerFacet(createMediaProjectObjectOwner());
}

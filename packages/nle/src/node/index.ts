import { randomUUID } from "node:crypto";
import { open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  openNleProjectService,
  readNleProject,
  serializeNleProject,
  NleRevisionConflict,
  NleProjectService,
} from "../index.js";
import type {
  ProjectHost,
  ProjectHostContext,
  ProjectOwnerProvider,
} from "@hypit/project";
import { resolveNodeProjectFile } from "@hypit/project/node";

async function projectFile(context: ProjectHostContext, path: string): Promise<string> {
  const file = await resolveNodeProjectFile(context.boundary.root, path, "NLE document").catch(error => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new NleDocumentConflict(path);
    throw error;
  });
  if (file.path !== path) throw new NleDocumentConflict(path);
  return file.address;
}

type SavedFile = { readonly contents: string; readonly modifiedAt: number };
const savedFiles = new WeakMap<NleProjectService, SavedFile>();
const fileOperations = new WeakMap<NleProjectService, Promise<unknown>>();

function savedFile(service: NleProjectService): SavedFile {
  const file = savedFiles.get(service);
  if (file === undefined) throw new Error("NLE Service has no open document file.");
  return file;
}

export function nodeNleProjectSavedAt(service: NleProjectService): number {
  return savedFile(service).modifiedAt;
}

async function readDocumentFile(context: ProjectHostContext, path: string): Promise<SavedFile> {
  const file = await open(await projectFile(context, path), "r");
  try {
    const contents = await file.readFile("utf8");
    return { contents, modifiedAt: (await file.stat()).mtimeMs };
  } finally {
    await file.close();
  }
}

function acceptReload(service: NleProjectService, file: SavedFile, reload: () => void): void {
  const previous = savedFile(service);
  savedFiles.set(service, file);
  try {
    reload();
  } catch (error) {
    savedFiles.set(service, previous);
    throw error;
  }
}

export class NleDocumentConflict extends Error {
  constructor(readonly path: string) {
    super(`NLE document changed on disk: ${path}`);
    this.name = "NleDocumentConflict";
  }
}

function serializeFileOperation(service: NleProjectService, operate: () => Promise<void>): Promise<void> {
  const next = (fileOperations.get(service) ?? Promise.resolve()).then(operate);
  fileOperations.set(service, next.catch(() => undefined));
  return next;
}

async function saveDocument(
  context: ProjectHostContext,
  file: string,
  service: NleProjectService,
  revision: number,
  contents: string,
): Promise<void> {
  const path = await projectFile(context, file);
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.writing`);
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
    const { mtimeMs } = await stat(temporary);
    const current = await projectFile(context, file);
    if (current !== path || await readFile(current, "utf8") !== savedFile(service).contents) {
      throw new NleDocumentConflict(file);
    }
    const currentRevision = service.snapshot().revision;
    if (currentRevision !== revision) {
      throw new NleRevisionConflict(revision, currentRevision);
    }
    await rename(temporary, path);
    savedFiles.set(service, { contents, modifiedAt: mtimeMs });
    service.markSaved(revision);
  } finally {
    await rm(temporary, { force: true });
  }
}

export type NleProjectOwnerProvider = ProjectOwnerProvider<NleProjectService, ProjectHostContext> & {
  save(context: ProjectHostContext, path: string, service: NleProjectService): Promise<void>;
  reload(context: ProjectHostContext, path: string, service: NleProjectService): Promise<void>;
};

export const nleProjectOwnerProvider: NleProjectOwnerProvider = {
  owner: "nle.project",
  async open(context, path) {
    const file = await readDocumentFile(context, path);
    const service = openNleProjectService(readNleProject(file.contents));
    savedFiles.set(service, file);
    return service;
  },
  close() {},
  save(context, path, service) {
    return serializeFileOperation(service, async () => {
      const snapshot = service.snapshot();
      await saveDocument(context, path, service, snapshot.revision, serializeNleProject(snapshot.project));
    });
  },
  reload(context, path, service) {
    return serializeFileOperation(service, async () => {
      const snapshot = service.snapshot();
      const file = await readDocumentFile(context, path);
      const project = readNleProject(file.contents);
      acceptReload(service, file, () => service.reload(project, snapshot.revision));
    });
  },
};

export async function openNodeNleProject(project: ProjectHost, document: string) {
  const { path } = await resolveNodeProjectFile(project.boundary.root, document, "NLE document");
  return await project.documents.open(nleProjectOwnerProvider, path);
}

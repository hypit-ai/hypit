import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  openNleProjectService,
  readNleProject,
  serializeNleProject,
  NleRevisionConflict,
  NleProjectService,
} from "../index.js";
import {
  openNleViewService,
  readNleView,
  serializeNleView,
  NleViewRevisionConflict,
  type NleViewService,
} from "../view/index.js";
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

type NleDocumentService = NleProjectService | NleViewService;
const savedContents = new WeakMap<NleDocumentService, string>();
const fileOperations = new WeakMap<NleDocumentService, Promise<unknown>>();

export class NleDocumentConflict extends Error {
  constructor(readonly path: string) {
    super(`NLE document changed on disk: ${path}`);
    this.name = "NleDocumentConflict";
  }
}

function serializeFileOperation(service: NleDocumentService, operate: () => Promise<void>): Promise<void> {
  const next = (fileOperations.get(service) ?? Promise.resolve()).then(operate);
  fileOperations.set(service, next.catch(() => undefined));
  return next;
}

async function saveDocument(
  context: ProjectHostContext,
  file: string,
  service: NleDocumentService,
  revision: number,
  contents: string,
): Promise<void> {
  const path = await projectFile(context, file);
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.writing`);
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
    const current = await projectFile(context, file);
    if (current !== path || await readFile(current, "utf8") !== savedContents.get(service)) {
      throw new NleDocumentConflict(file);
    }
    const currentRevision = service.snapshot().revision;
    if (currentRevision !== revision) {
      throw service instanceof NleProjectService
        ? new NleRevisionConflict(revision, currentRevision)
        : new NleViewRevisionConflict(revision, currentRevision);
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  savedContents.set(service, contents);
  service.markSaved(revision);
}

export type NleProjectOwnerProvider = ProjectOwnerProvider<NleProjectService, ProjectHostContext> & {
  save(context: ProjectHostContext, path: string, service: NleProjectService): Promise<void>;
  reload(context: ProjectHostContext, path: string, service: NleProjectService): Promise<void>;
};

export type NleViewOwnerProvider = ProjectOwnerProvider<NleViewService, ProjectHostContext> & {
  save(context: ProjectHostContext, path: string, service: NleViewService): Promise<void>;
  reload(context: ProjectHostContext, path: string, service: NleViewService): Promise<void>;
};

export const nleProjectOwnerProvider: NleProjectOwnerProvider = {
  owner: "nle.project",
  async open(context, path) {
    const contents = await readFile(await projectFile(context, path), "utf8");
    const service = openNleProjectService(readNleProject(contents));
    savedContents.set(service, contents);
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
      const contents = await readFile(await projectFile(context, path), "utf8");
      service.reload(readNleProject(contents), snapshot.revision);
      savedContents.set(service, contents);
    });
  },
};

export const nleViewOwnerProvider: NleViewOwnerProvider = {
  owner: "nle.view",
  async open(context, path) {
    const contents = await readFile(await projectFile(context, path), "utf8");
    const service = openNleViewService(readNleView(contents));
    savedContents.set(service, contents);
    return service;
  },
  close() {},
  save(context, path, service) {
    return serializeFileOperation(service, async () => {
      const snapshot = service.snapshot();
      await saveDocument(context, path, service, snapshot.revision, serializeNleView(snapshot.view));
    });
  },
  reload(context, path, service) {
    return serializeFileOperation(service, async () => {
      const snapshot = service.snapshot();
      const contents = await readFile(await projectFile(context, path), "utf8");
      service.reload(readNleView(contents), snapshot.revision);
      savedContents.set(service, contents);
    });
  },
};

export async function openNodeNleProject(project: ProjectHost, document: string) {
  const { path } = await resolveNodeProjectFile(project.boundary.root, document, "NLE document");
  return await project.documents.open(nleProjectOwnerProvider, path);
}

export async function openNodeNleView(project: ProjectHost, document: string) {
  const { path } = await resolveNodeProjectFile(project.boundary.root, document, "NLE View document");
  return await project.documents.open(nleViewOwnerProvider, path);
}

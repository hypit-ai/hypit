import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  openNleProjectService,
  readNleProject,
  serializeNleProject,
  type NleProjectService,
} from "@hypit/nle";
import {
  openNleViewService,
  readNleView,
  serializeNleView,
  type NleViewService,
} from "@hypit/nle/view";
import {
  assertProjectRelativePath,
  type ProjectHostContext,
  type ProjectOwnerProvider,
} from "@hypit/project";

function projectFile(context: ProjectHostContext, path: string): string {
  assertProjectRelativePath(path);
  const target = resolve(context.boundary.root, path);
  const local = relative(context.boundary.root, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)) {
    throw new Error(`Project document ${path} leaves the Project Boundary.`);
  }
  return target;
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.writing`);
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
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
    return openNleProjectService(readNleProject(await readFile(projectFile(context, path), "utf8")));
  },
  close() {},
  async save(context, path, service) {
    const snapshot = service.snapshot();
    await atomicWrite(projectFile(context, path), serializeNleProject(snapshot.project));
    service.markSaved(snapshot.revision);
  },
  async reload(context, path, service) {
    const snapshot = service.snapshot();
    const project = readNleProject(await readFile(projectFile(context, path), "utf8"));
    service.reload(project, snapshot.revision);
  },
};

export const nleViewOwnerProvider: NleViewOwnerProvider = {
  owner: "nle.view",
  async open(context, path) {
    return openNleViewService(readNleView(await readFile(projectFile(context, path), "utf8")));
  },
  close() {},
  async save(context, path, service) {
    const snapshot = service.snapshot();
    await atomicWrite(projectFile(context, path), serializeNleView(snapshot.view));
    service.markSaved(snapshot.revision);
  },
  async reload(context, path, service) {
    const snapshot = service.snapshot();
    const view = readNleView(await readFile(projectFile(context, path), "utf8"));
    service.reload(view, snapshot.revision);
  },
};

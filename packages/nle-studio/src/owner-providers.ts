import { randomUUID } from "node:crypto";
import { link, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  openNleProjectService,
  readNleProject,
  serializeNleProject,
  NleRevisionConflict,
  NleProjectService,
} from "@hypit/nle";
import {
  openNleViewService,
  readNleView,
  serializeNleView,
  NleViewRevisionConflict,
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

type NleDocumentService = NleProjectService | NleViewService;
const savedContents = new WeakMap<NleDocumentService, string | undefined>();

export class NleStudioDocumentConflict extends Error {
  constructor(readonly path: string) {
    super(`NLE Studio document changed on disk: ${path}`);
    this.name = "NleStudioDocumentConflict";
  }
}

export async function readStudioDocument(context: ProjectHostContext, path: string): Promise<string | undefined> {
  try {
    return await readFile(projectFile(context, path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function studioDocumentModifiedAt(context: ProjectHostContext, path: string): Promise<number> {
  try {
    return (await stat(projectFile(context, path))).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export function rememberStudioDocument(service: NleDocumentService, contents: string | undefined): void {
  savedContents.set(service, contents);
}

export async function assertStudioDocumentUnchanged(context: ProjectHostContext, path: string, service: NleDocumentService): Promise<void> {
  const contents = await readStudioDocument(context, path);
  if (!savedContents.has(service) || contents !== savedContents.get(service)) throw new NleStudioDocumentConflict(path);
}

async function saveDocument(
  context: ProjectHostContext,
  file: string,
  service: NleDocumentService,
  revision: number,
  contents: string,
): Promise<void> {
  const path = projectFile(context, file);
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.writing`);
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
    await assertStudioDocumentUnchanged(context, file, service);
    const currentRevision = service.snapshot().revision;
    if (currentRevision !== revision) {
      throw service instanceof NleProjectService
        ? new NleRevisionConflict(revision, currentRevision)
        : new NleViewRevisionConflict(revision, currentRevision);
    }
    if (savedContents.get(service) === undefined) {
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new NleStudioDocumentConflict(file);
        throw error;
      }
    } else {
      await rename(temporary, path);
    }
  } finally {
    await rm(temporary, { force: true });
  }
  rememberStudioDocument(service, contents);
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
    const contents = await readFile(projectFile(context, path), "utf8");
    const service = openNleProjectService(readNleProject(contents));
    rememberStudioDocument(service, contents);
    return service;
  },
  close() {},
  async save(context, path, service) {
    const snapshot = service.snapshot();
    await saveDocument(context, path, service, snapshot.revision, serializeNleProject(snapshot.project));
  },
  async reload(context, path, service) {
    const snapshot = service.snapshot();
    const contents = await readFile(projectFile(context, path), "utf8");
    const project = readNleProject(contents);
    service.reload(project, snapshot.revision);
    rememberStudioDocument(service, contents);
  },
};

export const nleViewOwnerProvider: NleViewOwnerProvider = {
  owner: "nle.view",
  async open(context, path) {
    const contents = await readFile(projectFile(context, path), "utf8");
    const service = openNleViewService(readNleView(contents));
    rememberStudioDocument(service, contents);
    return service;
  },
  close() {},
  async save(context, path, service) {
    const snapshot = service.snapshot();
    await saveDocument(context, path, service, snapshot.revision, serializeNleView(snapshot.view));
  },
  async reload(context, path, service) {
    const snapshot = service.snapshot();
    const contents = await readFile(projectFile(context, path), "utf8");
    const view = readNleView(contents);
    service.reload(view, snapshot.revision);
    rememberStudioDocument(service, contents);
  },
};

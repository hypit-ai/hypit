import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  openNleProjectService,
  readNleProject,
  serializeNleProject,
  type NleProjectService,
} from "@hypit/nle";
import {
  createNleView,
  openNleViewService,
  readNleView,
  serializeNleView,
  type NleViewService,
} from "@hypit/nle/view";
import {
  openNleEditingSurface,
  type NleEditingSurface,
  type NleEditingSurfaceCommand,
} from "@hypit/nle/surface";
import type {
  NleStudioInspectorResponse,
  NleStudioMediaProjection,
  NleStudioPreviewProjection,
  NleStudioSession,
} from "./protocol.js";

export type NleStudioMediaPort = {
  observe(): Promise<NleStudioMediaProjection> | NleStudioMediaProjection;
};

export type NleStudioPreviewPort = {
  observe(): Promise<NleStudioPreviewProjection> | NleStudioPreviewProjection;
};

export type OpenLocalNleStudioOptions = {
  readonly projectPath: string;
  readonly viewPath?: string;
  readonly media?: NleStudioMediaPort;
  readonly preview?: NleStudioPreviewPort;
};

const emptyMedia: NleStudioMediaPort = {
  observe: () => ({ entries: [] }),
};

const unavailablePreview: NleStudioPreviewPort = {
  observe: () => ({ state: "unavailable" }),
};

function absolutePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function portableRelative(fromDirectory: string, target: string): string {
  const path = relative(fromDirectory, target).split(sep).join("/");
  return path.length === 0 ? basename(target) : path;
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.writing`);
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, path);
}

export class LocalNleStudioHost {
  readonly #projectPath: string;
  readonly #viewPath: string | undefined;
  readonly #projectService: NleProjectService;
  readonly #viewService: NleViewService;
  readonly #surface: NleEditingSurface;
  readonly #media: NleStudioMediaPort;
  readonly #preview: NleStudioPreviewPort;
  #closed = false;

  private constructor(value: {
    projectPath: string;
    viewPath: string | undefined;
    projectService: NleProjectService;
    viewService: NleViewService;
    surface: NleEditingSurface;
    media: NleStudioMediaPort;
    preview: NleStudioPreviewPort;
  }) {
    this.#projectPath = value.projectPath;
    this.#viewPath = value.viewPath;
    this.#projectService = value.projectService;
    this.#viewService = value.viewService;
    this.#surface = value.surface;
    this.#media = value.media;
    this.#preview = value.preview;
  }

  static async open(options: OpenLocalNleStudioOptions): Promise<LocalNleStudioHost> {
    const projectPath = absolutePath(options.projectPath);
    const viewPath = options.viewPath === undefined ? undefined : absolutePath(options.viewPath);
    const project = readNleProject(await readFile(projectPath, "utf8"));
    const root = project.compositions.find((composition) => composition.id === project.rootComposition)!;
    const view = viewPath === undefined
      ? createNleView({
        id: "studio-view",
        name: `${project.name} Workbench`,
        project: { path: basename(projectPath) },
        activeComposition: project.rootComposition,
        tracks: root.tracks.map((track) => track.id),
      })
      : readNleView(await readFile(viewPath, "utf8"));
    const projectService = openNleProjectService(project);
    const viewService = openNleViewService(view);
    const surface = openNleEditingSurface(projectService, viewService);
    surface.observe({ kind: "open" });
    return new LocalNleStudioHost({
      projectPath,
      viewPath,
      projectService,
      viewService,
      surface,
      media: options.media ?? emptyMedia,
      preview: options.preview ?? unavailablePreview,
    });
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("NLE Studio Host is closed.");
  }

  async observe(): Promise<NleStudioSession> {
    this.#assertOpen();
    const observation = this.#surface.observe({ kind: "open" });
    if (observation.kind !== "open") throw new Error("NLE Studio received an invalid open projection.");
    const [media, preview] = await Promise.all([this.#media.observe(), this.#preview.observe()]);
    return {
      projectDocument: { path: this.#projectPath },
      viewDocument: this.#viewPath === undefined
        ? { persistence: "session" }
        : { persistence: "document", path: this.#viewPath },
      open: observation.value,
      media,
      preview,
    };
  }

  async command(command: NleEditingSurfaceCommand): Promise<NleStudioSession> {
    this.#assertOpen();
    this.#surface.command(command);
    return this.observe();
  }

  inspector(item: string): NleStudioInspectorResponse {
    this.#assertOpen();
    const observation = this.#surface.observe({ kind: "inspector", item });
    if (observation.kind !== "inspector") throw new Error("NLE Studio received an invalid Inspector projection.");
    return { inspector: observation.value };
  }

  async save(): Promise<NleStudioSession> {
    this.#assertOpen();
    const project = this.#projectService.snapshot();
    await atomicWrite(this.#projectPath, serializeNleProject(project.project));
    this.#projectService.markSaved(project.revision);
    if (this.#viewPath !== undefined) {
      const view = this.#viewService.snapshot();
      await atomicWrite(this.#viewPath, serializeNleView(view.view));
      this.#viewService.markSaved(view.revision);
    }
    return this.observe();
  }

  async reload(): Promise<NleStudioSession> {
    this.#assertOpen();
    const projectBefore = this.#projectService.snapshot();
    const project = readNleProject(await readFile(this.#projectPath, "utf8"));
    this.#projectService.reload(project, projectBefore.revision);
    const viewBefore = this.#viewService.snapshot();
    if (this.#viewPath !== undefined) {
      this.#viewService.reload(readNleView(await readFile(this.#viewPath, "utf8")), viewBefore.revision);
    } else {
      const root = project.compositions.find((composition) => composition.id === project.rootComposition)!;
      this.#viewService.reload(createNleView({
        id: viewBefore.view.id,
        name: viewBefore.view.name,
        project: { path: portableRelative(dirname(this.#projectPath), this.#projectPath) },
        activeComposition: project.rootComposition,
        editRate: viewBefore.view.editRate,
        tracks: root.tracks.map((track) => track.id),
      }), viewBefore.revision);
    }
    return this.observe();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#surface.close();
  }
}

export async function openLocalNleStudio(
  options: OpenLocalNleStudioOptions,
): Promise<LocalNleStudioHost> {
  return LocalNleStudioHost.open(options);
}

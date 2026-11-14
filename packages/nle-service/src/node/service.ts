import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";

import type { Facet } from "@hypit/facet";
import {
  canRedoNleEdit,
  canUndoNleEdit,
  commitNleEdit,
  completeNleProjectSave,
  createMediaAssetMaterialization,
  createNleAuthoringHost,
  findNleItem,
  findNlePictureLayout,
  isNleEditSessionDirty,
  NleRevisionConflict,
  planNleSpatialEdit,
  prepareNleProjectSave,
  redoNleEdit,
  undoNleEdit,
  type NleAuthoringHost,
  type NleEditSession,
  type NlePictureLayout,
  type NleProject,
  type NleTransaction,
} from "@hypit/nle";
import { readNleProjectFile, writeNleProjectFile } from "@hypit/nle/node";
import {
  applyNleTimelineViewTransaction,
  allNleCanvasAffordances,
  allNleTimelineAffordances,
  assertNleTimelineViewAllowsTransaction,
  assertNleSpatialEditAllowed,
  createNleInspectorPresentationHost,
  createNleTimelineView,
  mergeNleTimelineItemObservations,
  NleTimelineViewRevisionConflict,
  projectNleCanvas,
  projectNleTimeline,
  reconcileNleTimelineView,
  resolveNleTimelineItemCapabilities,
  resolveNleSpatialItemCapabilities,
  type NleInspectorPresentationHost,
  type NleInspectorField,
  type NleInspectorScene,
  type NleTimelinePresentationHost,
  type NleTimelinePresentationResource,
  type NleTimelineView,
} from "@hypit/nle-view";
import { readNleTimelineViewFile, writeNleTimelineViewFile } from "@hypit/nle-view/node";
import type { ResourceId } from "@hypit/protocol";
import type { PreparedNodeNleProgramme } from "@hypit/nle-local";
import type { NodeProjectMediaService, ProjectMediaFileResource } from "@hypit/media-service/node";
import { projectMember } from "@hypit/project/node";
import type { TemporalRate } from "@hypit/temporal/algebra";

import {
  nleTransactionAffectsProgramme,
  nleTransactionChanges,
  nleTransactionItemPreviewInvalidations,
} from "../impact.js";
import type {
  NleServiceFileStatus,
  NleServiceApplicationState,
  NleServiceComponentMediaInputEditRequest,
  NleServiceComponentMediaInputs,
  NleServiceExportProgress,
  NleServiceExportRequest,
  NleServiceExportState,
  NleServiceMediaPlacementRequest,
  NleServiceMediaPlacementResponse,
  NleServiceOperationResponse,
  NleServiceOwnerPersistence,
  NleServiceParameterEditRequest,
  NleServicePersistence,
  NleServiceProjectionInvalidation,
  NleServiceReviewRequest,
  NleServiceReviewState,
  NleServiceSaveReceipt,
  NleServiceSaveRequest,
  NleServiceSnapshot,
  NleServiceSpatialAuthoring,
  NleServiceSpatialCommandRequest,
  NleServiceTransactionRequest,
  NleServiceViewTransactionRequest,
} from "../protocol.js";
import type {
  NleServiceActionRequest,
  NleServiceActionResult,
  NleServiceCommandRequest,
  NleServiceCommandResult,
  NleServiceObservationRequest,
  NleServiceObservationResult,
  NleServiceOperations,
} from "../operations.js";
import { NleMediaInspector } from "./media-inspector.js";
import { NleMediaLibrary } from "./media-library.js";
import { NlePreviewCache, type NleItemPreview } from "./preview-cache.js";
import {
  NleProgrammePreview,
  type NleProgrammeDocument,
  type NleProgrammeResource,
} from "./programme-preview.js";

type FileStamp = { readonly modified: number; readonly size: number } | undefined;

function assertInspectorValue(field: NleInspectorField, value: string | number | boolean): void {
  if (field.editable !== true) throw new Error(`NLE Inspector field ${field.id} is read-only.`);
  if (field.control === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)
      || field.minimum !== undefined && value < field.minimum
      || field.maximum !== undefined && value > field.maximum) {
      throw new Error(`NLE Inspector field ${field.id} requires a valid number.`);
    }
    return;
  }
  if (field.control === "boolean") {
    if (typeof value !== "boolean") throw new Error(`NLE Inspector field ${field.id} requires a boolean.`);
    return;
  }
  if (typeof value !== "string") throw new Error(`NLE Inspector field ${field.id} requires text.`);
  if (field.control === "select" && !field.options?.some((option) => option.value === value)) {
    throw new Error(`NLE Inspector field ${field.id} value is not an option.`);
  }
}

async function fileStamp(path: string): Promise<FileStamp> {
  try {
    const value = await stat(path);
    return { modified: value.mtimeMs, size: value.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function sameFileStamp(left: FileStamp, right: FileStamp): boolean {
  return left?.modified === right?.modified && left?.size === right?.size;
}

export class NleExternalFileConflict extends Error {
  constructor(readonly owner: "project" | "view") {
    super(`NLE ${owner === "project" ? "Project" : "Timeline View"} file changed outside this session.`);
    this.name = "NleExternalFileConflict";
  }
}

export type NleServiceOptions = {
  readonly projectRoot: string;
  readonly projectFile: string;
  readonly viewFile?: string;
  readonly media: NodeProjectMediaService;
  readonly presentations?: NleTimelinePresentationHost;
  readonly inspectors?: NleInspectorPresentationHost;
  readonly authoring?: NleAuthoringHost;
  readonly facets?: readonly Facet[];
  readonly export?: NleServiceExportExecutor;
  readonly review?: NleServiceReviewExecutor;
  readonly autosave?: false | { readonly delayMs?: number };
  /** Adapter-owned links for invocation-local projection resources. */
  readonly resources: NleServiceResourceLinks;
};

export type NleServiceExportExecution = {
  /** Lazily acquire this revision's linked Programme; projection-only executors need not open it. */
  readonly prepareProgramme: () => Promise<PreparedNodeNleProgramme>;
  readonly projectRoot: string;
  readonly projectFile: string;
  readonly project: NleProject;
  readonly outputFile: string;
  readonly pictureTarget: NleServiceExportRequest["pictureTarget"];
  readonly quality: NleServiceExportRequest["quality"];
  readonly frameRate: NleServiceExportRequest["frameRate"];
  readonly resolution: NleServiceExportRequest["resolution"];
  readonly signal: AbortSignal;
  readonly onProgress: (progress: NleServiceExportProgress) => void;
};

export type NleServiceExportResult = {
  readonly outputFile: string;
  readonly frameRate: NleServiceExportRequest["frameRate"];
  readonly frameCount: number;
  readonly canvas: { readonly width: number; readonly height: number };
};

export type NleServiceExportExecutor = (
  execution: NleServiceExportExecution,
) => Promise<NleServiceExportResult>;

export type NleServiceReviewExecution = {
  /** Lazily acquire this revision's linked Programme; projection-only executors need not open it. */
  readonly prepareProgramme: () => Promise<PreparedNodeNleProgramme>;
  readonly projectRoot: string;
  readonly projectFile: string;
  readonly project: NleProject;
  readonly toDirectory: string;
  readonly range: NleServiceReviewRequest["range"];
  readonly frames: readonly number[];
  readonly pictureTarget: NleServiceReviewRequest["pictureTarget"];
  readonly quality: NleServiceReviewRequest["quality"];
  readonly frameRate: NleServiceReviewRequest["frameRate"];
  readonly resolution: NleServiceReviewRequest["resolution"];
  readonly signal: AbortSignal;
  readonly onProgress: (progress: NleServiceExportProgress) => void;
};

export type NleServiceReviewResult = {
  readonly toDirectory: string;
  readonly videoFile: string;
  readonly frames: readonly { readonly frame: number; readonly file: string }[];
  readonly frameRate: NleServiceReviewRequest["frameRate"];
  readonly programmeFrameCount: number;
  readonly reviewFrameCount: number;
  readonly range: NleServiceReviewRequest["range"];
  readonly canvas: { readonly width: number; readonly height: number };
};

export type NleServiceReviewExecutor = (
  execution: NleServiceReviewExecution,
) => Promise<NleServiceReviewResult>;

export type NleServiceResourceLinks = {
  readonly media: (id: string, generation: number) => string;
  readonly presentation: (id: string, revision: number) => string;
  readonly programme: (id: ResourceId, generation: number) => string;
  readonly itemPreview: (
    item: string,
    generation: number,
    kind: "image" | "storyboard" | "waveform",
  ) => string;
};

function nextMediaItemId(project: NleProject, assetId: string): string {
  const occupied = new Set<string>([
    project.id,
    ...project.componentValues.map((value) => value.id),
    ...project.pictureLayouts.map((value) => value.id),
    ...project.tracks.map((track) => track.id),
    ...project.tracks.flatMap((track) => track.items.map((item) => item.id)),
    ...project.transitions.map((transition) => transition.id),
    ...project.mattes.map((matte) => matte.id),
  ]);
  const base = `${assetId}-use`.slice(0, 192);
  let id = base;
  let suffix = 2;
  while (occupied.has(id)) {
    const ending = `-${suffix}`;
    id = `${base.slice(0, 192 - ending.length)}${ending}`;
    suffix += 1;
  }
  return id;
}

type OperationChange = {
  readonly project: boolean;
  readonly view: boolean;
  readonly tracks: readonly string[];
  readonly items: readonly string[];
  readonly invalidated: readonly NleServiceProjectionInvalidation[];
};

export type NleServiceStateListener = (state: NleServiceApplicationState) => void;

/**
 * One open NLE authoring session, independent of HTTP, Desktop IPC or Agent Tool transport.
 * It is the single writer for Project and Timeline View facts and owns their derived projections.
 */
export class NleService implements NleServiceOperations {
  readonly projectRoot: string;
  readonly projectFile: string;
  readonly viewFile: string;

  readonly #presentations: NleTimelinePresentationHost | undefined;
  readonly #resources: NleServiceResourceLinks;
  readonly #inspectors: NleInspectorPresentationHost;
  readonly #authoring: NleAuthoringHost;
  readonly #previews: NlePreviewCache;
  readonly #mediaLibrary: NleMediaLibrary;
  readonly #programme: NleProgrammePreview;
  readonly #mediaInspector: NleMediaInspector;
  readonly #previewRate: TemporalRate;
  readonly #export: NleServiceExportExecutor | undefined;
  readonly #review: NleServiceReviewExecutor | undefined;

  #session: NleEditSession;
  #view: NleTimelineView;
  #viewDirty: boolean;
  #projectFileStamp: FileStamp;
  #viewFileStamp: FileStamp;
  #projectPersistence: NleServiceOwnerPersistence;
  #viewPersistence: NleServiceOwnerPersistence;
  #externalProjectChanged = false;
  #externalViewChanged = false;
  readonly #autosaveDelay: number | undefined;
  #autosaveTimer: NodeJS.Timeout | undefined;
  #watchTimer: NodeJS.Timeout | undefined;
  #watchers: FSWatcher[] = [];
  #closed = false;
  #applicationSequence = 0;
  #listeners = new Set<NleServiceStateListener>();
  #mutation = Promise.resolve();
  #exportSequence = 0;
  #exportState: NleServiceExportState = {
    format: "hypit.nle-service-export@1",
    id: 0,
    state: "idle",
  };
  #exportController: AbortController | undefined;
  #exportTask: Promise<void> | undefined;
  #reviewSequence = 0;
  #reviewState: NleServiceReviewState = {
    format: "hypit.nle-service-review@1",
    id: 0,
    state: "idle",
  };
  #reviewController: AbortController | undefined;
  #reviewTask: Promise<void> | undefined;

  private constructor(value: {
    readonly options: NleServiceOptions;
    readonly projectRoot: string;
    readonly projectFile: string;
    readonly viewFile: string;
    readonly session: NleEditSession;
    readonly view: NleTimelineView;
    readonly viewDirty: boolean;
    readonly projectFileStamp: FileStamp;
    readonly viewFileStamp: FileStamp;
  }) {
    this.projectRoot = value.projectRoot;
    this.projectFile = value.projectFile;
    this.viewFile = value.viewFile;
    this.#session = value.session;
    this.#view = value.view;
    this.#viewDirty = value.viewDirty;
    this.#projectFileStamp = value.projectFileStamp;
    this.#viewFileStamp = value.viewFileStamp;
    this.#projectPersistence = isNleEditSessionDirty(value.session) ? { state: "dirty" } : { state: "clean" };
    this.#viewPersistence = value.viewDirty ? { state: "dirty" } : { state: "clean" };
    this.#autosaveDelay = value.options.autosave === false || value.options.autosave === undefined
      ? undefined
      : value.options.autosave.delayMs ?? 650;
    this.#presentations = value.options.presentations;
    this.#resources = value.options.resources;
    this.#inspectors = value.options.inspectors ?? createNleInspectorPresentationHost([]);
    this.#authoring = value.options.authoring ?? createNleAuthoringHost([]);
    this.#previews = new NlePreviewCache(value.projectRoot, value.projectFile, value.options.resources.itemPreview);
    this.#mediaLibrary = new NleMediaLibrary(value.options.media, value.projectFile, value.options.resources.media);
    this.#programme = new NleProgrammePreview(
      value.projectRoot, value.projectFile, value.options.facets ?? [], value.options.resources.programme,
    );
    this.#mediaInspector = new NleMediaInspector(value.projectRoot, value.projectFile);
    this.#previewRate = structuredClone(value.view.editRate);
    this.#export = value.options.export;
    this.#review = value.options.review;
  }

  static async open(options: NleServiceOptions): Promise<NleService> {
    const projectRoot = resolve(options.projectRoot);
    const projectFile = projectMember(projectRoot, options.projectFile, "NLE Project");
    const defaultViewFile = projectFile.endsWith(".nle.json")
      ? `${projectFile.slice(0, -".nle.json".length)}.nle-view.json`
      : `${projectFile}.view.json`;
    const viewFile = projectMember(projectRoot, options.viewFile ?? defaultViewFile, "NLE Timeline View");
    const projectPathFromView = relative(dirname(viewFile), projectFile).split(sep).join("/");
    const session = await readNleProjectFile(projectFile);
    let viewExists = true;
    const openedView = await readNleTimelineViewFile(viewFile).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      viewExists = false;
      return createNleTimelineView({
        id: `${session.current.id}-main`,
        name: `${session.current.name} Timeline`,
        project: { path: projectPathFromView },
        tracks: session.current.tracks.map((track) => track.id),
      });
    });
    if (resolve(dirname(viewFile), openedView.project.path) !== projectFile) {
      throw new Error(`NLE Timeline View ${viewFile} refers to a different Project.`);
    }
    const view = reconcileNleTimelineView(openedView, session.current);
    const service = new NleService({
      options,
      projectRoot,
      projectFile,
      viewFile,
      session,
      view,
      viewDirty: !viewExists || view.revision !== openedView.revision,
      projectFileStamp: await fileStamp(projectFile),
      viewFileStamp: await fileStamp(viewFile),
    });
    service.#startWatching();
    service.#scheduleAutosave();
    return service;
  }

  get project(): NleProject { return this.#session.current; }
  get view(): NleTimelineView { return this.#view; }
  get programmeGeneration(): number { return this.#programme.generation; }
  get mediaGeneration(): number | undefined { return this.#mediaLibrary.generation; }

  #dirty(): boolean { return isNleEditSessionDirty(this.#session) || this.#viewDirty; }

  #persistence(): NleServicePersistence {
    return {
      project: structuredClone(this.#projectPersistence),
      view: structuredClone(this.#viewPersistence),
    };
  }

  applicationState(): NleServiceApplicationState {
    return {
      format: "hypit.nle-service-application-state@1",
      sequence: this.#applicationSequence,
      projectRevision: this.#session.current.revision,
      viewRevision: this.#view.revision,
      dirty: this.#dirty(),
      persistence: this.#persistence(),
      external: {
        project: this.#externalProjectChanged,
        view: this.#externalViewChanged,
      },
      export: this.exportState(),
      review: this.reviewState(),
    };
  }

  subscribe(listener: NleServiceStateListener): () => void {
    if (this.#closed) throw new Error("NLE application is closed.");
    this.#listeners.add(listener);
    listener(this.applicationState());
    return () => { this.#listeners.delete(listener); };
  }

  #publish(): void {
    this.#applicationSequence += 1;
    const state = this.applicationState();
    for (const listener of this.#listeners) {
      try {
        listener(state);
      } catch {
        this.#listeners.delete(listener);
      }
    }
  }

  #markDirty(owner: "project" | "view"): void {
    const externallyChanged = owner === "project" ? this.#externalProjectChanged : this.#externalViewChanged;
    if (externallyChanged) {
      const conflict = { state: "conflict" as const, error: new NleExternalFileConflict(owner).message };
      if (owner === "project") this.#projectPersistence = conflict;
      else this.#viewPersistence = conflict;
      return;
    }
    const current = owner === "project" ? this.#projectPersistence : this.#viewPersistence;
    if (current.state === "conflict") return;
    if (owner === "project") this.#projectPersistence = { state: "dirty" };
    else this.#viewPersistence = { state: "dirty" };
  }

  #scheduleAutosave(): void {
    if (this.#autosaveDelay === undefined || this.#closed || !this.#dirty()) return;
    if (this.#projectPersistence.state === "conflict" || this.#viewPersistence.state === "conflict") return;
    if (this.#autosaveTimer !== undefined) clearTimeout(this.#autosaveTimer);
    this.#autosaveTimer = setTimeout(() => {
      this.#autosaveTimer = undefined;
      void this.save({
        projectRevision: this.#session.current.revision,
        viewRevision: this.#view.revision,
      }).catch(() => undefined);
    }, this.#autosaveDelay);
  }

  #startWatching(): void {
    const filesByDirectory = new Map<string, Set<string>>();
    for (const file of [this.projectFile, this.viewFile]) {
      const directory = dirname(file);
      const files = filesByDirectory.get(directory) ?? new Set<string>();
      files.add(basename(file));
      filesByDirectory.set(directory, files);
    }
    for (const [directory, files] of filesByDirectory) {
      const watcher = watch(directory, { persistent: false }, (_event, changed) => {
        if (changed !== null && !files.has(changed.toString())) return;
        if (this.#watchTimer !== undefined) clearTimeout(this.#watchTimer);
        this.#watchTimer = setTimeout(() => {
          this.#watchTimer = undefined;
          void this.#mutate(async () => { await this.#observeExternalChanges(); });
        }, 80);
      });
      watcher.on("error", () => watcher.close());
      this.#watchers.push(watcher);
    }
  }

  async #observeExternalChanges(): Promise<void> {
    const beforeProject = this.#externalProjectChanged;
    const beforeView = this.#externalViewChanged;
    const beforeProjectState = this.#projectPersistence.state;
    const beforeViewState = this.#viewPersistence.state;
    const projectChanged = !sameFileStamp(this.#projectFileStamp, await fileStamp(this.projectFile));
    const viewChanged = !sameFileStamp(this.#viewFileStamp, await fileStamp(this.viewFile));
    this.#externalProjectChanged ||= projectChanged;
    this.#externalViewChanged ||= viewChanged;
    if (projectChanged && isNleEditSessionDirty(this.#session)) {
      this.#projectPersistence = { state: "conflict", error: new NleExternalFileConflict("project").message };
    }
    if (viewChanged && this.#viewDirty) {
      this.#viewPersistence = { state: "conflict", error: new NleExternalFileConflict("view").message };
    }
    if (beforeProject !== this.#externalProjectChanged || beforeView !== this.#externalViewChanged
      || beforeProjectState !== this.#projectPersistence.state || beforeViewState !== this.#viewPersistence.state) {
      this.#publish();
    }
  }

  exportState(): NleServiceExportState { return structuredClone(this.#exportState); }

  async startExport(input: NleServiceExportRequest): Promise<NleServiceExportState> {
    return await this.#mutate(async () => {
      const execute = this.#export;
      if (execute === undefined) throw new Error("NLE export is unavailable in this application host.");
      if (this.#exportTask !== undefined || this.#reviewTask !== undefined) {
        throw new Error("An NLE render action is already running.");
      }
      if (input.revision !== this.#session.current.revision) {
        throw new NleRevisionConflict(input.revision, this.#session.current.revision);
      }
      if (BigInt(input.resolution.width) * BigInt(this.#session.current.canvas.height)
        !== BigInt(input.resolution.height) * BigInt(this.#session.current.canvas.width)) {
        throw new Error(`NLE export resolution ${input.resolution.width}x${input.resolution.height}`
          + ` changes Project aspect ${this.#session.current.canvas.width}x${this.#session.current.canvas.height}.`);
      }

      const id = ++this.#exportSequence;
      const outputFile = projectMember(
        this.projectRoot,
        resolve(this.projectRoot, "exports", input.fileName),
        "NLE export",
      );
      const project = structuredClone(this.#session.current);
      const programmeGeneration = this.#programme.generation;
      const controller = new AbortController();
      this.#exportController = controller;
      this.#exportState = {
        format: "hypit.nle-service-export@1",
        id,
        revision: input.revision,
        state: "running",
        progress: { phase: "open", state: "start" },
      };
      this.#publish();
      this.#exportTask = Promise.resolve().then(async () => await execute({
        prepareProgramme: async () => await this.#programme.prepared(project, programmeGeneration, true),
        projectRoot: this.projectRoot,
        projectFile: this.projectFile,
        project,
        outputFile,
        pictureTarget: input.pictureTarget,
        quality: input.quality,
        frameRate: input.frameRate,
        resolution: input.resolution,
        signal: controller.signal,
        onProgress: (progress) => {
          if (this.#exportState.id === id) {
            this.#exportState = { ...this.#exportState, progress };
            this.#publish();
          }
        },
      })).then((result) => {
        if (this.#exportState.id !== id) return;
        this.#exportState = {
          format: "hypit.nle-service-export@1",
          id,
          revision: input.revision,
          state: "complete",
          output: {
            path: relative(this.projectRoot, result.outputFile).split(sep).join("/"),
            frameRate: structuredClone(result.frameRate),
            frameCount: result.frameCount,
            canvas: structuredClone(result.canvas),
          },
        };
        this.#publish();
      }, (error: unknown) => {
        if (this.#exportState.id !== id) return;
        this.#exportState = controller.signal.aborted
          ? { format: "hypit.nle-service-export@1", id, revision: input.revision, state: "cancelled" }
          : {
              format: "hypit.nle-service-export@1",
              id,
              revision: input.revision,
              state: "failed",
              error: error instanceof Error ? error.message : String(error),
            };
        this.#publish();
      }).finally(() => {
        if (this.#exportState.id === id) this.#exportController = undefined;
        this.#exportTask = undefined;
      });
      return this.exportState();
    });
  }

  cancelExport(): NleServiceExportState {
    if (this.#exportTask !== undefined && this.#exportController !== undefined) {
      this.#exportController.abort(new Error("NLE export was cancelled."));
      this.#exportState = {
        format: "hypit.nle-service-export@1",
        id: this.#exportState.id,
        ...(this.#exportState.revision === undefined ? {} : { revision: this.#exportState.revision }),
        state: "cancelled",
      };
      this.#publish();
    }
    return this.exportState();
  }

  reviewState(): NleServiceReviewState { return structuredClone(this.#reviewState); }

  async startReview(input: NleServiceReviewRequest): Promise<NleServiceReviewState> {
    return await this.#mutate(async () => {
      const execute = this.#review;
      if (execute === undefined) throw new Error("NLE review is unavailable in this application host.");
      if (this.#reviewTask !== undefined || this.#exportTask !== undefined) {
        throw new Error("An NLE render action is already running.");
      }
      if (input.revision !== this.#session.current.revision) {
        throw new NleRevisionConflict(input.revision, this.#session.current.revision);
      }
      if (BigInt(input.resolution.width) * BigInt(this.#session.current.canvas.height)
        !== BigInt(input.resolution.height) * BigInt(this.#session.current.canvas.width)) {
        throw new Error(`NLE review resolution ${input.resolution.width}x${input.resolution.height}`
          + ` changes Project aspect ${this.#session.current.canvas.width}x${this.#session.current.canvas.height}.`);
      }

      const id = ++this.#reviewSequence;
      const toDirectory = projectMember(
        this.projectRoot,
        resolve(this.projectRoot, "reviews", input.directoryName),
        "NLE review",
      );
      const project = structuredClone(this.#session.current);
      const programmeGeneration = this.#programme.generation;
      const controller = new AbortController();
      this.#reviewController = controller;
      this.#reviewState = {
        format: "hypit.nle-service-review@1",
        id,
        revision: input.revision,
        state: "running",
        progress: { phase: "open", state: "start" },
      };
      this.#publish();
      this.#reviewTask = Promise.resolve().then(async () => await execute({
        prepareProgramme: async () => await this.#programme.prepared(project, programmeGeneration, true),
        projectRoot: this.projectRoot,
        projectFile: this.projectFile,
        project,
        toDirectory,
        range: structuredClone(input.range),
        frames: [...input.frames],
        pictureTarget: input.pictureTarget,
        quality: input.quality,
        frameRate: structuredClone(input.frameRate),
        resolution: structuredClone(input.resolution),
        signal: controller.signal,
        onProgress: (progress) => {
          if (this.#reviewState.id === id) {
            this.#reviewState = { ...this.#reviewState, progress };
            this.#publish();
          }
        },
      })).then((result) => {
        if (this.#reviewState.id !== id) return;
        this.#reviewState = {
          format: "hypit.nle-service-review@1",
          id,
          revision: input.revision,
          state: "complete",
          output: {
            path: relative(this.projectRoot, result.toDirectory).split(sep).join("/"),
            video: relative(this.projectRoot, result.videoFile).split(sep).join("/"),
            frames: result.frames.map(value => ({
              frame: value.frame,
              path: relative(this.projectRoot, value.file).split(sep).join("/"),
            })),
            frameRate: structuredClone(result.frameRate),
            programmeFrameCount: result.programmeFrameCount,
            reviewFrameCount: result.reviewFrameCount,
            range: structuredClone(result.range),
            canvas: structuredClone(result.canvas),
          },
        };
        this.#publish();
      }, (error: unknown) => {
        if (this.#reviewState.id !== id) return;
        this.#reviewState = controller.signal.aborted
          ? { format: "hypit.nle-service-review@1", id, revision: input.revision, state: "cancelled" }
          : {
              format: "hypit.nle-service-review@1",
              id,
              revision: input.revision,
              state: "failed",
              error: error instanceof Error ? error.message : String(error),
            };
        this.#publish();
      }).finally(() => {
        if (this.#reviewState.id === id) this.#reviewController = undefined;
        this.#reviewTask = undefined;
      });
      return this.reviewState();
    });
  }

  cancelReview(): NleServiceReviewState {
    if (this.#reviewTask !== undefined && this.#reviewController !== undefined) {
      this.#reviewController.abort(new Error("NLE review was cancelled."));
      this.#reviewState = {
        format: "hypit.nle-service-review@1",
        id: this.#reviewState.id,
        ...(this.#reviewState.revision === undefined ? {} : { revision: this.#reviewState.revision }),
        state: "cancelled",
      };
      this.#publish();
    }
    return this.reviewState();
  }

  async #mutate<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.#mutation.then(operation, operation);
    this.#mutation = next.then(() => undefined, () => undefined);
    return await next;
  }

  #presentationObservations() {
    return this.#presentations?.observations(this.#session.current, (resource) =>
      this.#resources.presentation(resource, this.#session.current.revision)) ?? [];
  }

  #timelineCapabilities() {
    return resolveNleTimelineItemCapabilities(this.#session.current, this.#view, this.#authoring);
  }

  #spatialCapabilities() {
    return resolveNleSpatialItemCapabilities(this.#session.current, this.#view);
  }

  #reconcileView(): void {
    const reconciled = reconcileNleTimelineView(this.#view, this.#session.current);
    this.#viewDirty ||= reconciled.revision !== this.#view.revision;
    this.#view = reconciled;
  }

  #history() {
    const undo = this.#session.cursor > 0 ? this.#session.history[this.#session.cursor - 1] : undefined;
    const redo = this.#session.cursor < this.#session.history.length
      ? this.#session.history[this.#session.cursor] : undefined;
    return {
      canUndo: canUndoNleEdit(this.#session),
      canRedo: canRedoNleEdit(this.#session),
      ...(undo === undefined ? {} : { undoLabel: undo.label }),
      ...(redo === undefined ? {} : { redoLabel: redo.label }),
    };
  }

  async #scenes() {
    const observations = mergeNleTimelineItemObservations([
      ...this.#presentationObservations(),
      ...await this.#previews.observations(this.#session.current),
    ]);
    return {
      scene: projectNleTimeline(
        this.#session.current,
        this.#view,
        observations,
        this.#timelineCapabilities(),
        allNleTimelineAffordances,
      ),
      canvasScene: projectNleCanvas(
        this.#session.current,
        this.#view,
        observations,
        this.#spatialCapabilities(),
        allNleCanvasAffordances,
      ),
    };
  }

  async snapshot(): Promise<NleServiceSnapshot> {
    return {
      format: "hypit.nle-service@1",
      project: this.#session.current,
      view: this.#view,
      ...await this.#scenes(),
      programmeGeneration: this.#programme.generation,
      mediaLibrary: await this.#mediaLibrary.view(),
      projectFile: this.projectFile,
      viewFile: this.viewFile,
      dirty: this.#dirty(),
      persistence: this.#persistence(),
      ...this.#history(),
    };
  }

  async timelineScene() {
    return (await this.#scenes()).scene;
  }

  async canvasScene() {
    return (await this.#scenes()).canvasScene;
  }

  async observe(request: NleServiceObservationRequest): Promise<NleServiceObservationResult> {
    switch (request.kind) {
      case "snapshot": return { kind: request.kind, value: await this.snapshot() };
      case "timeline": return { kind: request.kind, value: await this.timelineScene() };
      case "canvas": return { kind: request.kind, value: await this.canvasScene() };
      case "application-state": return { kind: request.kind, value: this.applicationState() };
      case "file-status": return { kind: request.kind, value: await this.fileStatus() };
      case "spatial-authoring": return { kind: request.kind, value: this.spatialAuthoring() };
      case "component-media-inputs": return { kind: request.kind, value: this.componentMediaInputs(request.item) };
      case "inspector": return { kind: request.kind, value: await this.inspectorScene(request.item) };
      case "export-state": return { kind: request.kind, value: this.exportState() };
      case "review-state": return { kind: request.kind, value: this.reviewState() };
    }
  }

  async command(request: NleServiceCommandRequest): Promise<NleServiceCommandResult> {
    switch (request.kind) {
      case "project.transaction": return { kind: "operation", value: await this.transaction(request.input) };
      case "view.transaction": return { kind: "operation", value: await this.viewTransaction(request.input) };
      case "parameter.edit": return { kind: "operation", value: await this.parameterEdit(request.input) };
      case "component-media-input.edit": {
        return { kind: "operation", value: await this.componentMediaInputEdit(request.input) };
      }
      case "spatial.edit": return { kind: "operation", value: await this.spatialCommand(request.input) };
      case "media.place": return { kind: "media-placement", value: await this.placeMedia(request.input) };
      case "media.refresh": return { kind: "snapshot", value: await this.refreshMedia() };
      case "history.undo": return { kind: "operation", value: await this.undo() };
      case "history.redo": return { kind: "operation", value: await this.redo() };
      case "document.save": return { kind: "save", value: await this.save(request.input) };
      case "document.reload": return { kind: "snapshot", value: await this.reload() };
    }
  }

  async action(request: NleServiceActionRequest): Promise<NleServiceActionResult> {
    switch (request.kind) {
      case "export.start": return { kind: "export", value: await this.startExport(request.input) };
      case "export.cancel": return { kind: "export", value: this.cancelExport() };
      case "review.start": return { kind: "review", value: await this.startReview(request.input) };
      case "review.cancel": return { kind: "review", value: this.cancelReview() };
    }
  }

  spatialAuthoring(): NleServiceSpatialAuthoring {
    return {
      format: "hypit.nle-service-spatial-authoring@1",
      revision: this.#session.current.revision,
      items: this.#spatialCapabilities(),
    };
  }

  async #operation(beforeProject: NleProject, change: OperationChange): Promise<NleServiceOperationResponse> {
    if (change.project) this.#markDirty("project");
    if (change.view || this.#viewDirty) this.#markDirty("view");
    this.#scheduleAutosave();
    this.#publish();
    const history = this.#history();
    const dirty = this.#dirty();
    const persistence = this.#persistence();
    const scenes = await this.#scenes();
    const affectedItems = new Set(change.items);
    const affectedTracks = new Set(change.tracks);
    for (const project of [beforeProject, this.#session.current]) {
      for (const track of project.tracks) {
        if (track.items.some((item) => affectedItems.has(item.id))) affectedTracks.add(track.id);
        if (affectedTracks.has(track.id)) track.items.forEach((item) => affectedItems.add(item.id));
      }
    }
    const project = this.#session.current;
    return {
      format: "hypit.nle-service-operation-response@1",
      receipt: {
        format: "hypit.nle-service-operation@1",
        projectRevision: this.#session.current.revision,
        viewRevision: this.#view.revision,
        dirty,
        history,
        changed: {
          project: change.project,
          view: change.view,
          tracks: [...new Set(change.tracks)],
          items: [...new Set(change.items)],
        },
        invalidated: [...new Set(change.invalidated)],
        programmeGeneration: this.#programme.generation,
        persistence,
      },
      patch: {
        project: {
          revision: project.revision,
          name: project.name,
          canvas: project.canvas,
          componentValues: project.componentValues,
          pictureLayouts: project.pictureLayouts,
          transitions: project.transitions,
          mattes: project.mattes,
          trackOrder: project.tracks.map((track) => track.id),
          tracks: project.tracks.filter((track) => affectedTracks.has(track.id)),
        },
        view: this.#view,
        timeline: {
          maximumFrame: scenes.scene.maximumFrame,
          trackOrder: scenes.scene.tracks.map((track) => track.id),
          tracks: scenes.scene.tracks.filter((track) => affectedTracks.has(track.id)),
        },
        canvas: {
          canvas: scenes.canvasScene.canvas,
          layerOrder: scenes.canvasScene.layers.map((layer) => layer.id),
          layers: scenes.canvasScene.layers.filter((layer) =>
            affectedTracks.has(layer.track) || affectedItems.has(layer.id)),
        },
      },
      programmeGeneration: this.#programme.generation,
      dirty,
      persistence,
      ...history,
    };
  }

  async fileStatus(): Promise<NleServiceFileStatus> {
    await this.#mutate(async () => { await this.#observeExternalChanges(); });
    return {
      format: "hypit.nle-service-file-status@1",
      changed: this.#externalProjectChanged || this.#externalViewChanged,
      dirty: this.#dirty(),
      projectRevision: this.#session.current.revision,
      viewRevision: this.#view.revision,
      persistence: this.#persistence(),
    };
  }

  async reload(): Promise<NleServiceSnapshot> {
    await this.#mutate(async () => {
      if (isNleEditSessionDirty(this.#session) || this.#viewDirty) {
        throw new Error("NLE session has unsaved changes and cannot reload external files.");
      }
      const session = await readNleProjectFile(this.projectFile);
      const openedView = await readNleTimelineViewFile(this.viewFile);
      if (resolve(dirname(this.viewFile), openedView.project.path) !== this.projectFile) {
        throw new Error(`NLE Timeline View ${this.viewFile} refers to a different Project.`);
      }
      this.#session = session;
      this.#view = reconcileNleTimelineView(openedView, session.current);
      this.#viewDirty = this.#view.revision !== openedView.revision;
      this.#projectFileStamp = await fileStamp(this.projectFile);
      this.#viewFileStamp = await fileStamp(this.viewFile);
      this.#externalProjectChanged = false;
      this.#externalViewChanged = false;
      this.#projectPersistence = { state: isNleEditSessionDirty(session) ? "dirty" : "clean" };
      this.#viewPersistence = { state: this.#viewDirty ? "dirty" : "clean" };
      this.#previews.invalidate();
      this.#programme.invalidate();
      this.#publish();
    });
    this.#scheduleAutosave();
    return await this.snapshot();
  }

  async transaction(input: NleServiceTransactionRequest): Promise<NleServiceOperationResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      const affectsProgramme = nleTransactionAffectsProgramme(input.transaction);
      const changes = nleTransactionChanges(this.#session.current, input.transaction);
      const previewInvalidations = nleTransactionItemPreviewInvalidations(this.#session.current, input.transaction);
      assertNleTimelineViewAllowsTransaction(
        this.#view, this.#session.current, input.transaction, this.#timelineCapabilities(),
      );
      this.#session = commitNleEdit(this.#session, input);
      this.#previews.invalidate(previewInvalidations);
      if (affectsProgramme) this.#programme.invalidate();
      this.#reconcileView();
      return await this.#operation(beforeProject, {
        project: true,
        view: false,
        tracks: changes.tracks,
        items: changes.items,
        invalidated: [
          "timeline", "canvas", "inspector",
          ...(affectsProgramme ? ["programme" as const] : []),
          ...(previewInvalidations.length > 0 ? ["item-preview" as const] : []),
        ],
      });
    });
  }

  async placeMedia(input: NleServiceMediaPlacementRequest): Promise<NleServiceMediaPlacementResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      let projected = this.#mediaLibrary.materialization(input.media);
      if (projected === undefined) {
        // A Command adapter may place Media before any UI has requested the catalog projection.
        await this.#mediaLibrary.view();
        projected = this.#mediaLibrary.materialization(input.media);
      }
      if (projected === undefined) throw new Error(`NLE Media ${input.media} is unavailable.`);
      const item = nextMediaItemId(this.#session.current, projected.document.id);
      const planned = createMediaAssetMaterialization(this.#session.current, {
        itemId: item,
        asset: { path: projected.asset },
        interpretation: projected.document.media.interpretation,
        track: input.track,
        at: input.at,
        ...(input.duration === undefined ? {} : { duration: input.duration }),
      });
      const transaction = { ...planned, revision: input.revision };
      assertNleTimelineViewAllowsTransaction(
        this.#view, this.#session.current, transaction, this.#timelineCapabilities(),
      );
      this.#session = commitNleEdit(this.#session, {
        label: `添加素材 ${projected.document.id}`,
        transaction,
      });
      this.#previews.invalidate([item]);
      this.#programme.invalidate();
      this.#reconcileView();
      return {
        item,
        operation: await this.#operation(beforeProject, {
          project: true,
          view: false,
          tracks: [input.track],
          items: [item],
          invalidated: ["timeline", "canvas", "inspector", "programme", "item-preview"],
        }),
      };
    });
  }

  async refreshMedia(): Promise<NleServiceSnapshot> {
    await this.#mediaLibrary.refresh();
    this.#previews.invalidate();
    return await this.snapshot();
  }

  componentMediaInputs(item: string): NleServiceComponentMediaInputs {
    return {
      format: "hypit.nle-service-component-media-inputs@1",
      revision: this.#session.current.revision,
      item,
      inputs: this.#authoring.inspectComponentMediaInputs(this.#session.current, item),
    };
  }

  async componentMediaInputEdit(
    input: NleServiceComponentMediaInputEditRequest,
  ): Promise<NleServiceOperationResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      const descriptor = this.#authoring.inspectComponentMediaInputs(beforeProject, input.item)
        .find((candidate) => candidate.key === input.input);
      if (descriptor === undefined) {
        throw new Error(`NLE Component ${input.item} does not declare Media input ${input.input}.`);
      }
      let planned: NleTransaction;
      let label: string;
      if (input.media === null) {
        planned = this.#authoring.planComponentMediaInputRemove(beforeProject, input.item, input.input);
        label = `移除 ${input.item} · ${descriptor.label}`;
      } else {
        let projected = this.#mediaLibrary.materialization(input.media);
        if (projected === undefined) {
          await this.#mediaLibrary.view();
          projected = this.#mediaLibrary.materialization(input.media);
        }
        if (projected === undefined) throw new Error(`NLE Media ${input.media} is unavailable.`);
        for (const signal of descriptor.requires) {
          if (projected.document.media.interpretation[signal] === undefined) {
            throw new Error(`NLE Media ${input.media} does not provide required ${signal} for ${descriptor.label}.`);
          }
        }
        planned = this.#authoring.planComponentMediaInputSet(
          beforeProject,
          input.item,
          input.input,
          { path: projected.asset },
        );
        label = `设置 ${input.item} · ${descriptor.label}`;
      }
      const transaction = { ...planned, revision: input.revision };
      const changes = nleTransactionChanges(beforeProject, transaction);
      assertNleTimelineViewAllowsTransaction(
        this.#view, beforeProject, transaction, this.#timelineCapabilities(),
      );
      this.#session = commitNleEdit(this.#session, { label, transaction });
      this.#previews.invalidate([input.item]);
      this.#programme.invalidate();
      this.#reconcileView();
      return await this.#operation(beforeProject, {
        project: true,
        view: false,
        tracks: changes.tracks,
        items: changes.items,
        invalidated: ["timeline", "canvas", "inspector", "programme", "item-preview"],
      });
    });
  }

  async parameterEdit(input: NleServiceParameterEditRequest): Promise<NleServiceOperationResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      const scene = this.#inspectors.scene(this.#session.current, this.#view, input.item);
      const section = scene.sections.find((candidate) => candidate.id === input.section);
      const field = section?.fields.find((candidate) => candidate.id === input.field);
      if (section === undefined || field === undefined) {
        throw new Error(`NLE Inspector field ${input.section}.${input.field} is unknown.`);
      }
      assertInspectorValue(field, input.value);
      const found = findNleItem(this.#session.current, input.item);
      const planned = section.id === "nle-occurrence" && field.id === "name"
        ? { revision: this.#session.current.revision, commands: [{
            kind: "item.update" as const,
            id: input.item,
            name: String(input.value).trim().length === 0 ? null : String(input.value).trim(),
          }] }
        : section.id === "nle-picture-layout" ? (() => {
            if (found.item.kind !== "present" || found.item.picture === undefined) {
              throw new Error(`NLE Item ${input.item} has no Picture layout.`);
            }
            const current = "ref" in found.item.picture.layout
              ? findNlePictureLayout(this.#session.current, found.item.picture.layout.ref).layout
              : found.item.picture.layout;
            const layout = structuredClone(current) as NlePictureLayout & Record<string, unknown>;
            if (!["x", "y", "width", "height", "fit", "contentX", "contentY"].includes(field.id)) {
              throw new Error(`NLE Picture Layout field ${field.id} is unknown.`);
            }
            layout[field.id] = input.value;
            const command = "ref" in found.item.picture.layout ? (() => {
              const resource = findNlePictureLayout(this.#session.current, found.item.picture.layout.ref);
              return { kind: "picture-layout.replace" as const, value: {
                ...structuredClone(resource), layout,
              } };
            })() : { kind: "item.replace" as const, item: {
              ...structuredClone(found.item),
              picture: { ...structuredClone(found.item.picture), layout },
            } };
            return { revision: this.#session.current.revision, commands: [command] };
          })()
          : (() => {
              const edit = this.#inspectors.packageEdit(
                this.#session.current, input.item, input.section, input.field, input.value,
              );
              return edit.kind === "component"
                ? this.#authoring.planComponentParameterEdit(this.#session.current, input.item, edit.operation)
                : edit.kind === "operator"
                  ? this.#authoring.planOperatorParameterEdit(
                      this.#session.current,
                      edit.address,
                      edit.operation,
                    )
                  : this.#authoring.planComponentValueEdit(this.#session.current, edit.value, edit.operation);
            })();
      const transaction = { ...planned, revision: input.revision };
      const changes = nleTransactionChanges(this.#session.current, transaction);
      assertNleTimelineViewAllowsTransaction(
        this.#view, this.#session.current, transaction, this.#timelineCapabilities(),
      );
      this.#session = commitNleEdit(this.#session, {
        label: `编辑 ${input.item} · ${input.field}`,
        transaction,
      });
      this.#programme.invalidate();
      this.#reconcileView();
      return await this.#operation(beforeProject, {
        project: true,
        view: false,
        tracks: changes.tracks,
        items: changes.items,
        invalidated: ["timeline", "canvas", "inspector", "programme"],
      });
    });
  }

  async spatialCommand(input: NleServiceSpatialCommandRequest): Promise<NleServiceOperationResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      assertNleSpatialEditAllowed(this.#spatialCapabilities(), input.item, input.edit);
      const transaction = {
        ...planNleSpatialEdit(this.#session.current, input.item, input.edit),
        revision: input.revision,
      };
      const changes = nleTransactionChanges(this.#session.current, transaction);
      assertNleTimelineViewAllowsTransaction(
        this.#view, this.#session.current, transaction, this.#timelineCapabilities(),
      );
      const label = input.edit.kind === "frame.translate" ? `移动 ${input.item} 画面`
        : input.edit.kind === "frame.resize" ? `调整 ${input.item} 画面大小`
          : input.edit.kind === "fit.set" ? `设置 ${input.item} 适配方式`
            : input.edit.kind === "focus.set" ? `设置 ${input.item} 取景焦点`
              : input.edit.kind === "layout.share" ? `共享 ${input.item} 画面布局`
                : input.edit.kind === "layout.link" ? `链接 ${input.item} 画面布局`
                  : input.edit.kind === "layout.unlink" ? `解除 ${input.item} 共享布局`
                    : `调整 ${input.item} 画面布局`;
      this.#session = commitNleEdit(this.#session, { label, transaction });
      this.#programme.invalidate();
      this.#reconcileView();
      return await this.#operation(beforeProject, {
        project: true,
        view: false,
        tracks: changes.tracks,
        items: changes.items,
        invalidated: ["timeline", "canvas", "inspector", "programme"],
      });
    });
  }

  /** Existing Monitor adapter: full-layout drag completion is one subset of the headless command port. */
  async viewTransaction(input: NleServiceViewTransactionRequest): Promise<NleServiceOperationResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      const tracks = input.transaction.commands.flatMap((command) =>
        "track" in command ? [command.track]
          : command.kind === "view.update" || command.kind.startsWith("group.")
            ? this.#session.current.tracks.map((track) => track.id) : []);
      const canvasInvalidated = input.transaction.commands.some((command) =>
        command.kind === "track-lock.set" || command.kind === "view.update");
      this.#view = applyNleTimelineViewTransaction(this.#view, this.#session.current, input.transaction);
      this.#viewDirty = true;
      return await this.#operation(beforeProject, {
        project: false,
        view: true,
        tracks,
        items: [],
        invalidated: ["timeline", ...(canvasInvalidated ? ["canvas" as const] : [])],
      });
    });
  }

  async undo(): Promise<NleServiceOperationResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      this.#session = undoNleEdit(this.#session);
      this.#previews.invalidate();
      this.#programme.invalidate();
      this.#reconcileView();
      return await this.#wholeProjectOperation(beforeProject);
    });
  }

  async redo(): Promise<NleServiceOperationResponse> {
    return await this.#mutate(async () => {
      const beforeProject = this.#session.current;
      this.#session = redoNleEdit(this.#session);
      this.#previews.invalidate();
      this.#programme.invalidate();
      this.#reconcileView();
      return await this.#wholeProjectOperation(beforeProject);
    });
  }

  async #wholeProjectOperation(beforeProject: NleProject): Promise<NleServiceOperationResponse> {
    return await this.#operation(beforeProject, {
      project: true,
      view: false,
      tracks: [...new Set([
        ...beforeProject.tracks.map((track) => track.id),
        ...this.#session.current.tracks.map((track) => track.id),
      ])],
      items: [...new Set([
        ...beforeProject.tracks.flatMap((track) => track.items.map((item) => item.id)),
        ...this.#session.current.tracks.flatMap((track) => track.items.map((item) => item.id)),
      ])],
      invalidated: ["timeline", "canvas", "inspector", "programme", "item-preview"],
    });
  }

  async save(input: NleServiceSaveRequest): Promise<NleServiceSaveReceipt> {
    if (this.#autosaveTimer !== undefined) {
      clearTimeout(this.#autosaveTimer);
      this.#autosaveTimer = undefined;
    }
    await this.#mutate(async () => {
      if (input.projectRevision !== this.#session.current.revision) {
        throw new NleRevisionConflict(input.projectRevision, this.#session.current.revision);
      }
      if (input.viewRevision !== this.#view.revision) {
        throw new NleTimelineViewRevisionConflict(input.viewRevision, this.#view.revision);
      }
      let failure: unknown;
      if (isNleEditSessionDirty(this.#session)) {
        try {
          if (!sameFileStamp(this.#projectFileStamp, await fileStamp(this.projectFile))) {
            throw new NleExternalFileConflict("project");
          }
          this.#projectPersistence = { state: "saving" };
          this.#publish();
          const ticket = prepareNleProjectSave(this.#session);
          await writeNleProjectFile(this.projectFile, ticket);
          this.#projectFileStamp = await fileStamp(this.projectFile);
          this.#session = completeNleProjectSave(this.#session, ticket);
          this.#externalProjectChanged = false;
          this.#projectPersistence = { state: "clean" };
          this.#publish();
        } catch (error) {
          this.#projectPersistence = error instanceof NleExternalFileConflict
            ? { state: "conflict", error: error.message }
            : { state: "failed", error: error instanceof Error ? error.message : String(error) };
          this.#publish();
          failure = error;
        }
      }
      if (this.#viewDirty) {
        try {
          if (!sameFileStamp(this.#viewFileStamp, await fileStamp(this.viewFile))) {
            throw new NleExternalFileConflict("view");
          }
          this.#viewPersistence = { state: "saving" };
          this.#publish();
          await writeNleTimelineViewFile(this.viewFile, this.#view);
          this.#viewFileStamp = await fileStamp(this.viewFile);
          this.#viewDirty = false;
          this.#externalViewChanged = false;
          this.#viewPersistence = { state: "clean" };
          this.#publish();
        } catch (error) {
          this.#viewPersistence = error instanceof NleExternalFileConflict
            ? { state: "conflict", error: error.message }
            : { state: "failed", error: error instanceof Error ? error.message : String(error) };
          this.#publish();
          failure ??= error;
        }
      }
      if (failure !== undefined) throw failure;
    });
    return {
      format: "hypit.nle-service-save@1",
      projectRevision: this.#session.current.revision,
      viewRevision: this.#view.revision,
      dirty: this.#dirty(),
      persistence: this.#persistence(),
    };
  }

  mediaResource(id: string): ProjectMediaFileResource | undefined { return this.#mediaLibrary.resource(id); }
  presentationResource(id: string): NleTimelinePresentationResource | undefined {
    return this.#presentations?.resource(id);
  }
  programmeResource(id: ResourceId): NleProgrammeResource | undefined { return this.#programme.resource(id); }
  previewGeneration(item: string): number { return this.#previews.generation(item); }

  async programmeDocument(generation: number): Promise<NleProgrammeDocument> {
    return await this.#programme.document(this.#session.current, this.#previewRate, generation);
  }

  async itemPreview(
    item: string,
    kind: "image" | "storyboard" | "waveform",
    generation: number,
  ): Promise<NleItemPreview> {
    return await this.#previews.read(this.#session.current, item, kind, generation);
  }

  async inspectorScene(item: string): Promise<NleInspectorScene> {
    const observation = await this.#mediaInspector.observation(this.#session.current, item);
    const presentation = this.#presentations?.observations(this.#session.current)
      .find((candidate) => candidate.item === item);
    return this.#inspectors.scene(this.#session.current, this.#view, item, [
      ...(presentation?.title === undefined ? [] : [{ item, title: presentation.title, sections: [] }]),
      ...(observation === undefined ? [] : [observation]),
    ]);
  }

  async close(): Promise<void> {
    this.#closed = true;
    if (this.#autosaveTimer !== undefined) clearTimeout(this.#autosaveTimer);
    if (this.#watchTimer !== undefined) clearTimeout(this.#watchTimer);
    for (const watcher of this.#watchers) watcher.close();
    this.#listeners.clear();
    await this.#mutation;
    this.#exportController?.abort(new Error("NLE application closed during export."));
    this.#reviewController?.abort(new Error("NLE application closed during review."));
    await this.#exportTask;
    await this.#reviewTask;
    await this.#programme.close();
  }
}

export async function openNleService(
  options: NleServiceOptions,
): Promise<NleService> {
  return await NleService.open(options);
}

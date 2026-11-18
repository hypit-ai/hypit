import { basename, dirname, posix, relative, resolve, sep } from "node:path";
import type { ApplicationProductProvider } from "@hypit/application";
import type { NodeProjectMediaService } from "@hypit/media-asset/service/node";
import { defaultMediaSelection } from "@hypit/media";
import {
  inspectMediaFileFromContainerIndex,
  mediaTypeFromFile,
} from "@hypit/media-local";
import {
  createAdjustMaterialization,
  createComponentMaterialization,
  createMediaAssetMaterialization,
  createTransitionMaterialization,
  readNleProject,
  NleRevisionConflict,
  type NleCommand,
  type NleProject,
  type NleProjectService,
} from "@hypit/nle";
import {
  createNleView,
  openNleViewService,
  readNleView,
  reconcileNleView,
  NleViewRevisionConflict,
  type NleView,
  type NleViewService,
} from "@hypit/nle/view";
import {
  openNleEditingSurface,
  type NleEditingSurface,
  type NleEditingSurfaceCommand,
} from "@hypit/nle/surface";
import type {
  ProjectDocumentLease,
  ProjectHost,
  ProjectHostContext,
  ProjectHostResource,
  ProjectHostResourceResolution,
} from "@hypit/project";
import {
  assertStudioDocumentUnchanged,
  nleProjectOwnerProvider,
  nleViewOwnerProvider,
  readStudioDocument,
  rememberStudioDocument,
  studioDocumentModifiedAt,
} from "./owner-providers.js";
import {
  createNleStudioPackageBridge,
  type NleStudioPackageBridge,
} from "./packages.js";
import { planMediaInsertion } from "./media-insertion.js";
import type {
  NleStudioAdjustMaterializeRequest,
  NleStudioComponentMaterializeRequest,
  NleStudioInspectorResponse,
  NleStudioMediaProjection,
  NleStudioMediaPlaceRequest,
  NleStudioPreviewProjection,
  NleStudioSession,
  NleStudioTransitionMaterializeRequest,
} from "./protocol.js";

export type NleStudioPreviewPort = {
  observe(): Promise<NleStudioPreviewProjection> | NleStudioPreviewProjection;
};

export type OpenNleStudioProductSessionOptions = {
  readonly project: ProjectHost;
  readonly document: string;
  readonly viewDocument?: string;
  readonly preview?: NleStudioPreviewPort;
  readonly mediaImport?: NleStudioMediaImportPort;
};

export type NleStudioProductInput = {
  readonly document: string;
  readonly viewDocument?: string;
  readonly preview?: NleStudioPreviewPort;
};

export type NleStudioMediaImportRequest = {
  readonly sourcePath: string;
  readonly sourceName: string;
};

export type NleStudioMediaImportPort = {
  adopt(request: NleStudioMediaImportRequest): Promise<void>;
};

export const nleStudioProduct = "hypit.nle-studio";

const unavailablePreview: NleStudioPreviewPort = {
  observe: () => ({ state: "unavailable" }),
};
const documentOperations = new WeakMap<NleProjectService, Promise<void>>();

function context(project: ProjectHost): ProjectHostContext {
  return {
    boundary: project.boundary,
    packages: project.packages,
    media: project.media,
    resources: project.resources,
    executorClients: project.executorClients,
  };
}

function mediaName(path: string): string {
  const name = posix.basename(path);
  return name.endsWith(".media.json") ? name.slice(0, -".media.json".length) : name;
}

function sessionView(project: NleProject, document: string, id = `${project.id}:studio-view`) {
  const root = project.compositions.find((composition) => composition.id === project.rootComposition)!;
  return createNleView({
    id,
    name: `${project.name} Studio View`,
    project: { path: document },
    activeComposition: project.rootComposition,
    tracks: root.tracks.map((track) => track.id),
  });
}

function assertViewDocumentTarget(
  project: ProjectHost,
  projectDocument: string,
  viewDocument: string,
  view: NleView,
): void {
  const root = project.boundary.root;
  const expected = resolve(root, projectDocument);
  const actual = resolve(dirname(resolve(root, viewDocument)), view.project.path);
  if (actual !== expected) {
    throw new Error(`NLE View ${viewDocument} does not reference Project document ${projectDocument}.`);
  }
}

export class NleStudioProductSession {
  readonly #project: ProjectHost;
  readonly #context: ProjectHostContext;
  readonly #projectDocument: string;
  readonly #viewDocument: string;
  readonly #defaultView: boolean;
  readonly #projectLease: ProjectDocumentLease<NleProjectService>;
  readonly #viewLease: ProjectDocumentLease<NleViewService> | undefined;
  readonly #viewService: NleViewService;
  readonly #surface: NleEditingSurface;
  readonly #packages: NleStudioPackageBridge;
  readonly #preview: NleStudioPreviewPort;
  readonly #mediaImport: NleStudioMediaImportPort | undefined;
  readonly #mediaResources = new Map<string, ProjectHostResource>();
  #mediaGeneration = -1;
  #closed = false;
  #lastSavedAt: string;

  private constructor(value: {
    project: ProjectHost;
    context: ProjectHostContext;
    projectDocument: string;
    viewDocument: string;
    defaultView: boolean;
    lastSavedAt: string;
    projectLease: ProjectDocumentLease<NleProjectService>;
    viewLease: ProjectDocumentLease<NleViewService> | undefined;
    viewService: NleViewService;
    surface: NleEditingSurface;
    packages: NleStudioPackageBridge;
    preview: NleStudioPreviewPort;
    mediaImport: NleStudioMediaImportPort | undefined;
  }) {
    this.#project = value.project;
    this.#context = value.context;
    this.#projectDocument = value.projectDocument;
    this.#viewDocument = value.viewDocument;
    this.#defaultView = value.defaultView;
    this.#lastSavedAt = value.lastSavedAt;
    this.#projectLease = value.projectLease;
    this.#viewLease = value.viewLease;
    this.#viewService = value.viewService;
    this.#surface = value.surface;
    this.#packages = value.packages;
    this.#preview = value.preview;
    this.#mediaImport = value.mediaImport;
  }

  static async open(options: OpenNleStudioProductSessionOptions): Promise<NleStudioProductSession> {
    const projectContext = context(options.project);
    const projectLease = await options.project.documents.open(nleProjectOwnerProvider, options.document);
    const viewDocument = options.viewDocument ?? `${options.document.replace(/\.svml$/u, "")}.nle-view.json`;
    let viewLease: ProjectDocumentLease<NleViewService> | undefined;
    try {
      try {
        viewLease = await options.project.documents.open(nleViewOwnerProvider, viewDocument);
      } catch (error) {
        if (options.viewDocument !== undefined || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const viewService = viewLease?.service
        ?? openNleViewService(sessionView(projectLease.service.snapshot().project, basename(options.document)));
      if (viewLease === undefined) rememberStudioDocument(viewService, undefined);
      const viewSnapshot = viewService.snapshot();
      assertViewDocumentTarget(options.project, options.document, viewDocument, viewSnapshot.view);
      viewService.reconcile(projectLease.service.snapshot().project, viewSnapshot.revision);
      const modifiedAt = await Promise.all([options.document, viewDocument].map(path => studioDocumentModifiedAt(projectContext, path)));
      const packages = createNleStudioPackageBridge(projectContext.packages);
      const surface = openNleEditingSurface(projectLease.service, viewService, {
        authoring: packages.authoring,
        timelinePresentation: packages.timelinePresentation,
        inspectorPresentations: packages.inspectorPresentations,
        presentationResourceUrl: (resource) => `api/presentations/${encodeURIComponent(resource)}`,
      });
      surface.observe({ kind: "open" });
      return new NleStudioProductSession({
        project: options.project,
        context: projectContext,
        projectDocument: options.document,
        viewDocument,
        defaultView: options.viewDocument === undefined,
        lastSavedAt: new Date(Math.max(...modifiedAt)).toISOString(),
        projectLease,
        viewLease,
        viewService,
        surface,
        packages,
        preview: options.preview ?? unavailablePreview,
        mediaImport: options.mediaImport,
      });
    } catch (error) {
      viewLease?.close();
      projectLease.close();
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("NLE Studio Product Session is closed.");
  }

  #clearMediaResources(): void {
    for (const resource of this.#mediaResources.values()) this.#project.resources.revoke(resource.token);
    this.#mediaResources.clear();
  }

  async #projectMedia(): Promise<NleStudioMediaProjection> {
    const catalog = await this.#project.media.observe();
    const editRate = this.#viewService.snapshot().view.editRate;
    if (catalog.generation !== this.#mediaGeneration) {
      this.#clearMediaResources();
      this.#mediaGeneration = catalog.generation;
    }
    return {
      entries: await Promise.all(catalog.entries.map(async (entry) => {
        const name = mediaName(entry.reference.path);
        if (entry.state === "invalid") {
          return { id: entry.reference.path, name, kind: "unknown" as const, state: "invalid" as const,
            diagnostic: entry.diagnostic };
        }
        const kind = entry.picture === undefined ? "audio" as const
          : entry.audio ? "audiovisual" as const : "picture" as const;
        const projectedFrames = entry.duration === undefined ? undefined : Math.round(
          Number(entry.duration.ticks) * entry.duration.timeBase.numerator / entry.duration.timeBase.denominator
            * editRate.numerator / editRate.denominator,
        );
        const durationFrames = projectedFrames !== undefined && Number.isSafeInteger(projectedFrames)
          && projectedFrames > 0 ? projectedFrames : undefined;
        if (entry.state === "missing") {
          return { id: entry.reference.path, name, kind, state: "missing" as const, mediaType: entry.mediaType,
            ...(durationFrames === undefined ? {} : { durationFrames }),
            ...(entry.diagnostic === undefined ? {} : { diagnostic: entry.diagnostic }) };
        }
        try {
          let resource = this.#mediaResources.get(entry.reference.path);
          if (resource === undefined) {
            resource = await this.#project.resources.openMedia(entry.reference);
            this.#mediaResources.set(entry.reference.path, resource);
          }
          return { id: entry.reference.path, name, kind, state: "available" as const, mediaType: entry.mediaType,
            ...(durationFrames === undefined ? {} : { durationFrames }),
            resource: `api/resources/${encodeURIComponent(resource.token)}` };
        } catch (error) {
          return { id: entry.reference.path, name, kind, state: "missing" as const,
            diagnostic: error instanceof Error ? error.message : String(error) };
        }
      })),
    };
  }

  resource(token: string): ProjectHostResourceResolution {
    this.#assertOpen();
    if (![...this.#mediaResources.values()].some((resource) => resource.token === token)) {
      throw new Error(`NLE Studio Session does not own Project resource token ${token}.`);
    }
    return this.#project.resources.resolve(token);
  }

  async observe(): Promise<NleStudioSession> {
    this.#assertOpen();
    const observation = this.#surface.observe({ kind: "open" });
    if (observation.kind !== "open") throw new Error("NLE Studio received an invalid open projection.");
    const [media, preview] = await Promise.all([this.#projectMedia(), this.#preview.observe()]);
    return {
      projectDocument: { path: this.#projectDocument },
      viewDocument: { persistence: "document", path: this.#viewDocument },
      lastSavedAt: this.#lastSavedAt,
      open: observation.value,
      media,
      catalog: {
        components: this.#packages.components.map((entry) => ({
          package: entry.package,
          offering: entry.id,
          title: entry.title,
          category: entry.value.category,
          component: entry.value.component,
          duration: entry.value.duration,
        })),
        adjusts: this.#packages.adjusts.map((entry) => ({
          package: entry.package,
          offering: entry.id,
          title: entry.title,
          medium: entry.value.medium,
        })),
        transitions: this.#packages.transitions.map((entry) => ({
          package: entry.package,
          offering: entry.id,
          title: entry.title,
        })),
      },
      preview,
    };
  }

  async importMediaFile(request: NleStudioMediaImportRequest): Promise<NleStudioSession> {
    this.#assertOpen();
    if (this.#mediaImport === undefined) {
      throw new Error("NLE Studio has no Project Media import port.");
    }
    await this.#mediaImport.adopt(request);
    this.#lastSavedAt = new Date().toISOString();
    return await this.observe();
  }

  async command(command: NleEditingSurfaceCommand): Promise<NleStudioSession> {
    this.#assertOpen();
    this.#surface.command(command);
    return await this.observe();
  }

  async placeMedia(request: NleStudioMediaPlaceRequest): Promise<NleStudioSession> {
    this.#assertOpen();
    if (!Number.isSafeInteger(request.atFrame) || request.atFrame < 0) {
      throw new Error("NLE Studio Media placement start frame must be a non-negative safe integer.");
    }
    if (request.durationFrames !== undefined
      && (!Number.isSafeInteger(request.durationFrames) || request.durationFrames <= 0)) {
      throw new Error("NLE Studio Media placement duration must be a positive safe integer.");
    }
    const projectSnapshot = this.#projectLease.service.snapshot();
    const viewSnapshot = this.#viewService.snapshot();
    if (viewSnapshot.view.activeComposition !== request.composition) {
      throw new Error(`NLE Studio Media placement targets inactive Composition ${request.composition}.`);
    }
    const composition = projectSnapshot.project.compositions.find((entry) => entry.id === request.composition);
    const track = composition?.tracks.find((entry) => entry.id === request.track);
    if (composition === undefined || track === undefined) {
      throw new Error(`NLE Studio Media placement Track ${request.track} is outside Composition ${request.composition}.`);
    }
    const asset = await this.#project.media.open(request.reference);
    const rate = viewSnapshot.view.editRate;
    const frameTime = (frame: number) => {
      const ticks = frame * rate.denominator;
      if (!Number.isSafeInteger(ticks)) throw new Error("NLE Studio frame time exceeds the exact editing range.");
      return { ticks: String(ticks), timeBase: { numerator: 1, denominator: rate.numerator } };
    };
    const mediaPath = relative(
      dirname(resolve(this.#project.boundary.root, this.#projectDocument)),
      resolve(this.#project.boundary.root, request.reference.path),
    ).split(sep).join("/");
    const at = frameTime(request.atFrame);
    const duration = request.durationFrames === undefined ? asset.media.interpretation.domain?.duration : frameTime(request.durationFrames);
    const insertion = request.insert === true && duration !== undefined
      ? planMediaInsertion(composition, track, viewSnapshot.view.compositions.find(state => state.composition === composition.id)?.groups ?? [], at, duration)
      : undefined;
    const transaction = createMediaAssetMaterialization(projectSnapshot.project, {
      itemId: request.item,
      asset: { path: mediaPath },
      interpretation: asset.media.interpretation,
      track: request.track,
      at: insertion?.start ?? at,
      ...(duration === undefined ? {} : { duration }),
      ...(request.includeAudio === undefined ? {} : { audio: request.includeAudio ? {} : false }),
      ...(request.layout === undefined ? {} : { picture: { layout: request.layout } }),
    });
    this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands: insertion?.move ? [insertion.move, ...transaction.commands] : transaction.commands,
    });
    return await this.observe();
  }

  async materializeComponent(request: NleStudioComponentMaterializeRequest): Promise<NleStudioSession> {
    this.#assertOpen();
    if (!Number.isSafeInteger(request.atFrame) || request.atFrame < 0) {
      throw new Error("NLE Studio Component placement start frame must be a non-negative safe integer.");
    }
    if (request.durationFrames !== undefined
      && (!Number.isSafeInteger(request.durationFrames) || request.durationFrames <= 0)) {
      throw new Error("NLE Studio Component placement duration must be a positive safe integer.");
    }
    const offering = this.#packages.component(request.package, request.offering);
    if (offering === undefined) {
      throw new Error(`NLE Studio Component offering ${request.package}#${request.offering} is not selected.`);
    }
    const projectSnapshot = this.#projectLease.service.snapshot();
    const viewSnapshot = this.#viewService.snapshot();
    if (viewSnapshot.view.activeComposition !== request.composition) {
      throw new Error(`NLE Studio Component placement targets inactive Composition ${request.composition}.`);
    }
    const composition = projectSnapshot.project.compositions.find((entry) => entry.id === request.composition);
    if (composition?.tracks.some((track) => track.id === request.track) !== true) {
      throw new Error(
        `NLE Studio Component placement Track ${request.track} is outside Composition ${request.composition}.`,
      );
    }
    const rate = viewSnapshot.view.editRate;
    const frameTime = (frame: number) => {
      const ticks = frame * rate.denominator;
      if (!Number.isSafeInteger(ticks)) throw new Error("NLE Studio frame time exceeds the exact editing range.");
      return { ticks: String(ticks), timeBase: { numerator: 1, denominator: rate.numerator } };
    };
    const transaction = createComponentMaterialization(projectSnapshot.project, {
      id: request.item,
      track: request.track,
      component: offering.value.component,
      ...(offering.value.category === "subtitle" ? { role: "subtitle" } : {}),
      parameters: offering.value.parameters,
      at: frameTime(request.atFrame),
      duration: request.durationFrames === undefined
        ? offering.value.duration
        : frameTime(request.durationFrames),
      ...(offering.value.layout === undefined ? {} : { layout: offering.value.layout }),
    });
    this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands: transaction.commands,
    });
    return await this.observe();
  }

  async materializeAdjust(request: NleStudioAdjustMaterializeRequest): Promise<NleStudioSession> {
    this.#assertOpen();
    if (!Number.isSafeInteger(request.atFrame) || request.atFrame < 0) {
      throw new Error("NLE Studio Adjust placement start frame must be a non-negative safe integer.");
    }
    if (request.durationFrames !== undefined
      && (!Number.isSafeInteger(request.durationFrames) || request.durationFrames <= 0)) {
      throw new Error("NLE Studio Adjust placement duration must be a positive safe integer.");
    }
    const offering = this.#packages.adjust(request.package, request.offering);
    if (offering === undefined) {
      throw new Error(`NLE Studio Adjust offering ${request.package}#${request.offering} is not selected.`);
    }
    const projectSnapshot = this.#projectLease.service.snapshot();
    const viewSnapshot = this.#viewService.snapshot();
    if (viewSnapshot.view.activeComposition !== request.composition) {
      throw new Error(`NLE Studio Adjust placement targets inactive Composition ${request.composition}.`);
    }
    const composition = projectSnapshot.project.compositions.find((entry) => entry.id === request.composition);
    const track = composition?.tracks.find((entry) => entry.id === request.track);
    if (track === undefined) {
      throw new Error(`NLE Studio Adjust placement Track ${request.track} is outside Composition ${request.composition}.`);
    }
    if (track.kind !== offering.value.medium) {
      throw new Error(`NLE Studio Adjust offering ${request.package}#${request.offering} requires a ${offering.value.medium} Track.`);
    }
    const rate = viewSnapshot.view.editRate;
    const frameTime = (frame: number) => {
      const ticks = frame * rate.denominator;
      if (!Number.isSafeInteger(ticks)) throw new Error("NLE Studio frame time exceeds the exact editing range.");
      return { ticks: String(ticks), timeBase: { numerator: 1, denominator: rate.numerator } };
    };
    const transaction = createAdjustMaterialization(projectSnapshot.project, {
      id: request.item,
      track: request.track,
      operator: offering.value.operator,
      parameters: { kind: "inline", value: offering.value.parameters },
      at: frameTime(request.atFrame),
      duration: request.durationFrames === undefined ? offering.value.duration : frameTime(request.durationFrames),
    });
    this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands: transaction.commands,
    });
    return await this.observe();
  }

  async materializeTransition(request: NleStudioTransitionMaterializeRequest): Promise<NleStudioSession> {
    this.#assertOpen();
    if (request.durationFrames !== undefined
      && (!Number.isSafeInteger(request.durationFrames) || request.durationFrames <= 0)) {
      throw new Error("NLE Studio Transition duration must be a positive safe integer.");
    }
    const offering = this.#packages.transition(request.package, request.offering);
    if (offering === undefined) {
      throw new Error(`NLE Studio Transition offering ${request.package}#${request.offering} is not selected.`);
    }
    const projectSnapshot = this.#projectLease.service.snapshot();
    const viewSnapshot = this.#viewService.snapshot();
    if (viewSnapshot.view.activeComposition !== request.composition) {
      throw new Error(`NLE Studio Transition targets inactive Composition ${request.composition}.`);
    }
    const rate = viewSnapshot.view.editRate;
    const frameTime = (frame: number) => {
      const ticks = frame * rate.denominator;
      if (!Number.isSafeInteger(ticks)) throw new Error("NLE Studio frame time exceeds the exact editing range.");
      return { ticks: String(ticks), timeBase: { numerator: 1, denominator: rate.numerator } };
    };
    const existing = projectSnapshot.project.compositions.find(entry => entry.id === request.composition)?.transitions
      .find(entry => entry.id === request.transition && entry.outgoing === request.outgoing && entry.incoming === request.incoming);
    const commands: readonly NleCommand[] = existing === undefined ? createTransitionMaterialization(projectSnapshot.project, {
      id: request.transition,
      composition: request.composition,
      outgoing: request.outgoing,
      incoming: request.incoming,
      operator: offering.value.operator,
      parameters: offering.value.parameters,
      duration: request.durationFrames === undefined
        ? offering.value.duration
        : frameTime(request.durationFrames),
    }).commands : [{
      kind: "transition.replace",
      transition: { ...existing, operator: offering.value.operator, parameters: offering.value.parameters },
    }];
    this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands,
    });
    return await this.observe();
  }

  async presentationResource(resource: string): Promise<{ readonly mediaType: string; readonly bytes: Uint8Array }> {
    this.#assertOpen();
    const value = this.#packages.timelinePresentation.resource(resource);
    if (value === undefined) throw new Error(`Unknown NLE Studio presentation resource: ${resource}.`);
    return { mediaType: value.mediaType, bytes: await value.read() };
  }

  inspector(item: string): NleStudioInspectorResponse {
    this.#assertOpen();
    const observation = this.#surface.observe({ kind: "inspector", item });
    if (observation.kind !== "inspector") throw new Error("NLE Studio received an invalid Inspector projection.");
    return { inspector: observation.value };
  }

  #withDocuments<T>(operation: () => Promise<T>): Promise<T> {
    const project = this.#projectLease.service;
    const previous = documentOperations.get(project) ?? Promise.resolve();
    const next = previous.then(() => { this.#assertOpen(); return operation(); });
    documentOperations.set(project, next.then(() => undefined, () => undefined));
    return next;
  }

  async #checkDocuments(): Promise<void> {
    await assertStudioDocumentUnchanged(this.#context, this.#projectDocument, this.#projectLease.service);
    await assertStudioDocumentUnchanged(this.#context, this.#viewDocument, this.#viewService);
  }

  checkDocuments(): Promise<void> {
    return this.#withDocuments(() => this.#checkDocuments());
  }

  save(): Promise<NleStudioSession> {
    return this.#withDocuments(async () => {
      await this.#checkDocuments();
      if (this.#projectLease.service.snapshot().dirty) {
        await nleProjectOwnerProvider.save(this.#context, this.#projectDocument, this.#projectLease.service);
        this.#lastSavedAt = new Date().toISOString();
      }
      if (this.#viewService.snapshot().dirty) {
        await nleViewOwnerProvider.save(this.#context, this.#viewDocument, this.#viewService);
        this.#lastSavedAt = new Date().toISOString();
      }
      return await this.observe();
    });
  }

  reload(): Promise<NleStudioSession> {
    return this.#withDocuments(async () => {
      const projectService = this.#projectLease.service;
      const projectSnapshot = projectService.snapshot();
      const viewSnapshot = this.#viewService.snapshot();
      const [projectContents, viewContents, projectModifiedAt, viewModifiedAt] = await Promise.all([
        readStudioDocument(this.#context, this.#projectDocument),
        readStudioDocument(this.#context, this.#viewDocument),
        studioDocumentModifiedAt(this.#context, this.#projectDocument),
        studioDocumentModifiedAt(this.#context, this.#viewDocument),
      ]);
      if (projectContents === undefined) throw new Error(`NLE Studio cannot reload missing document ${this.#projectDocument}.`);
      if (viewContents === undefined && !this.#defaultView) throw new Error(`NLE Studio cannot reload missing document ${this.#viewDocument}.`);
      const project = readNleProject(projectContents);
      const view = viewContents === undefined
        ? sessionView(project, basename(this.#projectDocument), viewSnapshot.view.id)
        : readNleView(viewContents);
      if (project.id !== projectSnapshot.project.id || view.id !== viewSnapshot.view.id) {
        throw new Error("NLE Studio cannot reload a document with a different identity.");
      }
      assertViewDocumentTarget(this.#project, this.#projectDocument, this.#viewDocument, view);
      const nextView = reconcileNleView(view, project);
      const projectRevision = projectService.snapshot().revision;
      const viewRevision = this.#viewService.snapshot().revision;
      if (projectRevision !== projectSnapshot.revision) throw new NleRevisionConflict(projectSnapshot.revision, projectRevision);
      if (viewRevision !== viewSnapshot.revision) throw new NleViewRevisionConflict(viewSnapshot.revision, viewRevision);
      projectService.reload(project, projectRevision);
      this.#viewService.reload(nextView, viewRevision);
      rememberStudioDocument(projectService, projectContents);
      rememberStudioDocument(this.#viewService, viewContents);
      this.#lastSavedAt = new Date(Math.max(projectModifiedAt, viewModifiedAt)).toISOString();
      return await this.observe();
    });
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#surface.close();
    this.#clearMediaResources();
    this.#viewLease?.close();
    this.#projectLease.close();
  }
}

export async function openNleStudioProductSession(
  options: OpenNleStudioProductSessionOptions,
): Promise<NleStudioProductSession> {
  return await NleStudioProductSession.open(options);
}

function productInput(value: unknown): NleStudioProductInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NLE Studio Product input must be an object.");
  }
  const selected = value as Partial<NleStudioProductInput>;
  if (typeof selected.document !== "string" || selected.document.length === 0) {
    throw new Error("NLE Studio Product input requires a document path.");
  }
  if (selected.viewDocument !== undefined
    && (typeof selected.viewDocument !== "string" || selected.viewDocument.length === 0)) {
    throw new Error("NLE Studio View document path is invalid.");
  }
  return {
    document: selected.document,
    ...(selected.viewDocument === undefined ? {} : { viewDocument: selected.viewDocument }),
    ...(selected.preview === undefined ? {} : { preview: selected.preview }),
  };
}

export const nleStudioProductProvider: ApplicationProductProvider = {
  product: nleStudioProduct,
  title: "NLE Studio",
  launchParameters: [
    {
      name: "document",
      title: "NLE document",
      required: true,
      initial: "project.svml",
      placeholder: "edits/main.svml",
    },
    {
      name: "viewDocument",
      title: "NLE View document",
      required: false,
      placeholder: "edits/main.nle-view.json",
    },
  ],
  async open(project, value) {
    const selected = productInput(value);
    const media = project.media as Partial<NodeProjectMediaService>;
    const mediaImport: NleStudioMediaImportPort | undefined = typeof media.adoptFile !== "function" ? undefined : {
      async adopt(request) {
        const mediaType = mediaTypeFromFile(request.sourceName);
        await media.adoptFile!({ ...request, mediaType }, {
          inspect: async (path, context) => await inspectMediaFileFromContainerIndex(path, {
            ...(context.signal === undefined ? {} : { signal: context.signal }),
            ...(mediaType.startsWith("image/") ? { constantPicture: true } : {}),
          }),
          select: (inspection) => defaultMediaSelection(inspection, mediaType),
        });
      },
    };
    return await openNleStudioProductSession({
      project,
      document: selected.document,
      ...(selected.viewDocument === undefined ? {} : { viewDocument: selected.viewDocument }),
      ...(selected.preview === undefined ? {} : { preview: selected.preview }),
      ...(mediaImport === undefined ? {} : { mediaImport }),
    });
  },
};

export {
  nleProjectOwnerProvider,
  nleViewOwnerProvider,
  type NleProjectOwnerProvider,
  type NleViewOwnerProvider,
} from "./owner-providers.js";
export {
  createNleStudioPackageBridge,
  nleStudioAdjustOfferingKind,
  nleStudioComponentOfferingKind,
  nleStudioTransitionOfferingKind,
  type NleStudioAdjustOffering,
  type NleStudioAdjustOfferingValue,
  type NleStudioComponentCategory,
  type NleStudioComponentOffering,
  type NleStudioComponentOfferingValue,
  type NleStudioPackageBridge,
  type NleStudioTransitionOffering,
  type NleStudioTransitionOfferingValue,
} from "./packages.js";

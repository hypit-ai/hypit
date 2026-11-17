import { dirname, posix, relative, resolve, sep } from "node:path";
import type { ApplicationProductProvider } from "@hypit/application";
import type { HtmlVideoExecutor } from "@hypit/html-video";
import type { NodeProjectMediaService } from "@hypit/media-asset/service/node";
import { defaultMediaSelection } from "@hypit/media";
import {
  inspectMediaFileFromContainerIndex,
  mediaTypeFromFile,
  type LocalMediaToolchainOptions,
} from "@hypit/media-local";
import {
  openNleDeliveryService,
  type NleDeliveryActionHandle,
  type NleDeliveryActionObservation,
  type NleDeliveryService,
} from "@hypit/nle-delivery";
import {
  createAdjustMaterialization,
  createComponentMaterialization,
  createMediaAssetMaterialization,
  createTransitionMaterialization,
  type NleProjectService,
} from "@hypit/nle";
import {
  createNleView,
  openNleViewService,
  type NleViewService,
} from "@hypit/nle/view";
import {
  openNleEditingSurface,
  type NleEditingSurface,
  type NleEditingSurfaceCommand,
  type NleEditingSurfaceReceipt,
} from "@hypit/nle/surface";
import type {
  ProjectDocumentLease,
  ProjectHost,
  ProjectHostContext,
  ProjectHostResource,
  ProjectHostResourceResolution,
} from "@hypit/project";
import {
  nleProjectOwnerProvider,
  nleViewOwnerProvider,
} from "./owner-providers.js";
import {
  createNleStudioPackageBridge,
  type NleStudioPackageBridge,
} from "./packages.js";
import type {
  NleStudioAdjustMaterializeRequest,
  NleStudioCatalogProjection,
  NleStudioComponentMaterializeRequest,
  NleStudioDeliveryStartRequest,
  NleStudioEvent,
  NleStudioEventListener,
  NleStudioInvalidation,
  NleStudioMediaProjection,
  NleStudioMediaPlaceRequest,
  NleStudioObservation,
  NleStudioObservationRequest,
  NleStudioOpenProjection,
  NleStudioOperationReceipt,
  NleStudioPreviewProjection,
  NleStudioTimelineProjection,
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
  readonly delivery?: NleDeliveryService;
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
  adopt(request: NleStudioMediaImportRequest): Promise<{ readonly reference: { readonly path: string } }>;
};

export const nleStudioProduct = "hypit.nle-studio";

const unavailablePreview: NleStudioPreviewPort = {
  observe: () => ({ state: "unavailable" }),
};

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

function sessionView(projectService: NleProjectService, document: string, previous?: NleViewService) {
  const project = projectService.snapshot().project;
  const root = project.compositions.find((composition) => composition.id === project.rootComposition)!;
  const previousSnapshot = previous?.snapshot().view;
  return createNleView({
    id: previousSnapshot?.id ?? `${project.id}:studio-view`,
    name: previousSnapshot?.name ?? `${project.name} Studio View`,
    project: { path: document },
    activeComposition: project.rootComposition,
    ...(previousSnapshot === undefined ? {} : { editRate: previousSnapshot.editRate }),
    tracks: root.tracks.map((track) => track.id),
  });
}

function assertViewDocumentTarget(
  project: ProjectHost,
  projectDocument: string,
  viewDocument: string,
  viewService: NleViewService,
): void {
  const root = project.boundary.root;
  const expected = resolve(root, projectDocument);
  const actual = resolve(dirname(resolve(root, viewDocument)), viewService.snapshot().view.project.path);
  if (actual !== expected) {
    throw new Error(`NLE View ${viewDocument} does not reference Project document ${projectDocument}.`);
  }
}

export class NleStudioProductSession {
  readonly #project: ProjectHost;
  readonly #context: ProjectHostContext;
  readonly #projectDocument: string;
  readonly #viewDocument: string | undefined;
  readonly #projectLease: ProjectDocumentLease<NleProjectService>;
  readonly #viewLease: ProjectDocumentLease<NleViewService> | undefined;
  readonly #viewService: NleViewService;
  readonly #surface: NleEditingSurface;
  readonly #packages: NleStudioPackageBridge;
  readonly #preview: NleStudioPreviewPort;
  readonly #mediaImport: NleStudioMediaImportPort | undefined;
  readonly #delivery: NleDeliveryService | undefined;
  readonly #mediaResources = new Map<string, Promise<ProjectHostResource>>();
  readonly #mediaTokens = new Set<string>();
  readonly #listeners = new Set<NleStudioEventListener>();
  readonly #deliverySubscriptions = new Map<string, () => void>();
  readonly #unsubscribeSurface: () => void;
  readonly #unsubscribeMedia: () => void;
  #mediaGeneration = -1;
  readonly #lifetime = new AbortController();

  get closed(): AbortSignal {
    return this.#lifetime.signal;
  }

  private constructor(value: {
    project: ProjectHost;
    context: ProjectHostContext;
    projectDocument: string;
    viewDocument: string | undefined;
    projectLease: ProjectDocumentLease<NleProjectService>;
    viewLease: ProjectDocumentLease<NleViewService> | undefined;
    viewService: NleViewService;
    surface: NleEditingSurface;
    packages: NleStudioPackageBridge;
    preview: NleStudioPreviewPort;
    mediaImport: NleStudioMediaImportPort | undefined;
    delivery: NleDeliveryService | undefined;
  }) {
    this.#project = value.project;
    this.#context = value.context;
    this.#projectDocument = value.projectDocument;
    this.#viewDocument = value.viewDocument;
    this.#projectLease = value.projectLease;
    this.#viewLease = value.viewLease;
    this.#viewService = value.viewService;
    this.#surface = value.surface;
    this.#packages = value.packages;
    this.#preview = value.preview;
    this.#mediaImport = value.mediaImport;
    this.#delivery = value.delivery;
    this.#unsubscribeSurface = this.#surface.subscribe((change) => {
      const invalidated: NleStudioInvalidation[] = change.kind === "savepoint" ? []
        : change.owner === "project"
          ? ["project", "timeline", "canvas", "inspector", "preview"]
          : ["timeline", "canvas", "inspector", "media", "preview"];
      this.#emit({
        scope: "product",
        kind: `${change.owner}.${change.kind}`,
        status: change.status,
        invalidated,
      });
    });
    this.#unsubscribeMedia = this.#project.subscribe((event) => {
      if (event.kind !== "media.catalog") return;
      this.#emit({
        scope: "project",
        kind: "media.catalog",
        status: this.#surface.status(),
        invalidated: ["media"],
        generation: event.generation,
      });
    });
  }

  static async open(options: OpenNleStudioProductSessionOptions): Promise<NleStudioProductSession> {
    const projectContext = context(options.project);
    const projectLease = await options.project.documents.open(nleProjectOwnerProvider, options.document);
    let viewLease: ProjectDocumentLease<NleViewService> | undefined;
    try {
      viewLease = options.viewDocument === undefined
        ? undefined
        : await options.project.documents.open(nleViewOwnerProvider, options.viewDocument);
      const viewService = viewLease?.service
        ?? openNleViewService(sessionView(projectLease.service, options.document));
      if (options.viewDocument !== undefined) {
        assertViewDocumentTarget(options.project, options.document, options.viewDocument, viewService);
      }
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
        viewDocument: options.viewDocument,
        projectLease,
        viewLease,
        viewService,
        surface,
        packages,
        preview: options.preview ?? unavailablePreview,
        mediaImport: options.mediaImport,
        delivery: options.delivery,
      });
    } catch (error) {
      viewLease?.close();
      projectLease.close();
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.closed.aborted) throw new Error("NLE Studio Product Session is closed.");
  }

  #emit(event: NleStudioEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(structuredClone(event));
      } catch {
        // Observation cannot veto an accepted owner change or Action update.
      }
    }
  }

  subscribe(listener: NleStudioEventListener): () => void {
    this.#assertOpen();
    if (typeof listener !== "function") throw new Error("NLE Studio event listener must be callable.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #clearMediaResources(): void {
    for (const token of this.#mediaTokens) this.#project.resources.revoke(token);
    this.#mediaTokens.clear();
    this.#mediaResources.clear();
  }

  #openMediaResource(path: string): Promise<ProjectHostResource> {
    const existing = this.#mediaResources.get(path);
    if (existing !== undefined) return existing;
    const pending = this.#project.resources.openMedia({ path }).then((resource) => {
      if (this.#mediaResources.get(path) !== pending) {
        this.#project.resources.revoke(resource.token);
        throw new Error(`NLE Studio Media projection changed while opening ${path}.`);
      }
      this.#mediaTokens.add(resource.token);
      return resource;
    }).catch((error: unknown) => {
      if (this.#mediaResources.get(path) === pending) this.#mediaResources.delete(path);
      throw error;
    });
    this.#mediaResources.set(path, pending);
    return pending;
  }

  async #projectMedia(): Promise<NleStudioMediaProjection> {
    const catalog = await this.#project.media.observe();
    this.#assertOpen();
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
          const resource = await this.#openMediaResource(entry.reference.path);
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
    if (!this.#mediaTokens.has(token)) {
      throw new Error(`NLE Studio Session does not own Project resource token ${token}.`);
    }
    return this.#project.resources.resolve(token);
  }

  #catalog(): NleStudioCatalogProjection {
    return {
      components: this.#packages.components.map((entry) => ({
        package: entry.package,
        offering: entry.id,
        title: entry.title,
        category: entry.value.category,
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
    };
  }

  #timeline(): NleStudioTimelineProjection {
    const observation = this.#surface.observe({ kind: "timeline" });
    if (observation.kind !== "timeline") throw new Error("NLE Studio received an invalid Timeline projection.");
    const project = this.#projectLease.service.snapshot().project;
    const composition = project.compositions.find((value) => value.id === observation.value.composition)!;
    const root = this.#project.boundary.root;
    const documentDirectory = dirname(resolve(root, this.#projectDocument));
    return {
      scene: observation.value,
      compositions: project.compositions.map((value) => ({ id: value.id, name: value.name })),
      itemMedia: composition.tracks.flatMap((track) => track.items.flatMap((item) => {
        if (item.kind !== "present" || item.source !== "media") return [];
        const local = relative(root, resolve(documentDirectory, item.asset.path));
        if (local === "" || local === ".." || local.startsWith(`..${sep}`)) {
          throw new Error(`NLE Media Item ${item.id} leaves the Project Boundary.`);
        }
        return [{ item: item.id, media: local.split(sep).join("/") }];
      })),
    };
  }

  #canvas() {
    const observation = this.#surface.observe({ kind: "canvas" });
    if (observation.kind !== "canvas") throw new Error("NLE Studio received an invalid Canvas projection.");
    return observation.value;
  }

  async #openProjection(): Promise<NleStudioOpenProjection> {
    const [media, preview] = await Promise.all([this.#projectMedia(), this.#preview.observe()]);
    return {
      project: this.#projectProjection(),
      viewDocument: this.#viewDocument === undefined
        ? { persistence: "session" }
        : { persistence: "document", path: this.#viewDocument },
      status: this.#surface.status(),
      timeline: this.#timeline(),
      canvas: this.#canvas(),
      media,
      catalog: this.#catalog(),
      preview,
      delivery: { state: this.#delivery === undefined ? "unavailable" : "available" },
    };
  }

  #projectProjection(): NleStudioOpenProjection["project"] {
    return { name: this.#projectLease.service.snapshot().project.name, document: this.#projectDocument };
  }

  async observe(request: NleStudioObservationRequest): Promise<NleStudioObservation> {
    this.#assertOpen();
    switch (request.kind) {
      case "open": return { kind: "open", value: await this.#openProjection() };
      case "project": return { kind: "project", value: this.#projectProjection() };
      case "status": return { kind: "status", value: this.#surface.status() };
      case "timeline": return { kind: "timeline", value: this.#timeline() };
      case "canvas": return { kind: "canvas", value: this.#canvas() };
      case "inspector": {
        const observation = this.#surface.observe({ kind: "inspector", item: request.item });
        if (observation.kind !== "inspector") throw new Error("NLE Studio received an invalid Inspector projection.");
        return { kind: "inspector", value: observation.value };
      }
      case "media": return { kind: "media", value: await this.#projectMedia() };
      case "catalog": return { kind: "catalog", value: this.#catalog() };
      case "preview": return { kind: "preview", value: await this.#preview.observe() };
      case "delivery": return {
        kind: "delivery",
        value: { state: this.#delivery === undefined ? "unavailable" : "available" },
      };
    }
  }

  #receipt(
    operation: string,
    receipt: NleEditingSurfaceReceipt,
    result?: NleStudioOperationReceipt["result"],
    extraInvalidations: readonly NleStudioInvalidation[] = [],
  ): NleStudioOperationReceipt {
    const invalidated = new Set<NleStudioInvalidation>(extraInvalidations);
    if (receipt.changed.project) invalidated.add("project");
    if (receipt.changed.view) {
      invalidated.add("media");
      invalidated.add("preview");
    }
    for (const value of receipt.invalidated) {
      if (value === "programme") invalidated.add("preview");
      else invalidated.add(value);
    }
    return {
      operation,
      status: receipt.status,
      changed: receipt.changed,
      invalidated: [...invalidated],
      ...(result === undefined ? {} : { result }),
    };
  }

  #observationReceipt(
    operation: string,
    invalidated: readonly NleStudioInvalidation[],
    result?: NleStudioOperationReceipt["result"],
  ): NleStudioOperationReceipt {
    return {
      operation,
      status: this.#surface.status(),
      changed: { project: false, view: false },
      invalidated: [...invalidated],
      ...(result === undefined ? {} : { result }),
    };
  }

  async importMediaFile(request: NleStudioMediaImportRequest): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    if (this.#mediaImport === undefined) {
      throw new Error("NLE Studio has no Project Media import port.");
    }
    const adopted = await this.#mediaImport.adopt(request);
    return this.#observationReceipt("media.import", ["media"], { media: adopted.reference.path });
  }

  async command(command: NleEditingSurfaceCommand): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    return this.#receipt(command.kind, this.#surface.command(command));
  }

  async placeMedia(request: NleStudioMediaPlaceRequest): Promise<NleStudioOperationReceipt> {
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
    if (composition?.tracks.some((track) => track.id === request.track) !== true) {
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
    const transaction = createMediaAssetMaterialization(projectSnapshot.project, {
      itemId: request.item,
      asset: { path: mediaPath },
      interpretation: asset.media.interpretation,
      track: request.track,
      at: frameTime(request.atFrame),
      ...(request.durationFrames === undefined ? {} : { duration: frameTime(request.durationFrames) }),
      ...(request.includeAudio === undefined ? {} : { audio: request.includeAudio ? {} : false }),
      ...(request.layout === undefined ? {} : { picture: { layout: request.layout } }),
    });
    const receipt = this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands: transaction.commands,
    });
    return this.#receipt("media.materialize", receipt, { item: request.item });
  }

  async materializeComponent(request: NleStudioComponentMaterializeRequest): Promise<NleStudioOperationReceipt> {
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
      parameters: offering.value.parameters,
      at: frameTime(request.atFrame),
      duration: request.durationFrames === undefined
        ? offering.value.duration
        : frameTime(request.durationFrames),
      ...(offering.value.layout === undefined ? {} : { layout: offering.value.layout }),
    });
    const receipt = this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands: transaction.commands,
    });
    return this.#receipt("component.materialize", receipt, { item: request.item });
  }

  async materializeAdjust(request: NleStudioAdjustMaterializeRequest): Promise<NleStudioOperationReceipt> {
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
    const receipt = this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands: transaction.commands,
    });
    return this.#receipt("adjust.materialize", receipt, { item: request.item });
  }

  async materializeTransition(request: NleStudioTransitionMaterializeRequest): Promise<NleStudioOperationReceipt> {
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
    const transaction = createTransitionMaterialization(projectSnapshot.project, {
      id: request.transition,
      composition: request.composition,
      outgoing: request.outgoing,
      incoming: request.incoming,
      operator: offering.value.operator,
      parameters: offering.value.parameters,
      duration: request.durationFrames === undefined
        ? offering.value.duration
        : frameTime(request.durationFrames),
    });
    const receipt = this.#surface.command({
      kind: "project.transact",
      expectedProjectRevision: request.expectedProjectRevision,
      expectedViewRevision: request.expectedViewRevision,
      commands: transaction.commands,
    });
    return this.#receipt("transition.materialize", receipt, { transition: request.transition });
  }

  async presentationResource(resource: string): Promise<{ readonly mediaType: string; readonly bytes: Uint8Array }> {
    this.#assertOpen();
    const value = this.#packages.timelinePresentation.resource(resource);
    if (value === undefined) throw new Error(`Unknown NLE Studio presentation resource: ${resource}.`);
    return { mediaType: value.mediaType, bytes: await value.read() };
  }

  async startDelivery(request: NleStudioDeliveryStartRequest): Promise<NleDeliveryActionObservation> {
    this.#assertOpen();
    if (this.#delivery === undefined) throw new Error("NLE Studio video delivery is unavailable.");
    const handle = await this.#delivery.start({ ...request, document: this.#projectDocument });
    this.#assertOpen();
    const unsubscribe = this.#delivery.subscribe(handle, ({ handle, state, progress }) => {
      if (state !== "queued" && state !== "running") {
        this.#deliverySubscriptions.get(handle)?.();
        this.#deliverySubscriptions.delete(handle);
      }
      this.#emit({ scope: "action", kind: "delivery", action: { handle, state, progress } });
    });
    const current = this.#delivery.observe(handle);
    if (current.state === "queued" || current.state === "running") this.#deliverySubscriptions.set(handle, unsubscribe);
    else unsubscribe();
    return current;
  }

  observeDelivery(handle: NleDeliveryActionHandle): NleDeliveryActionObservation {
    this.#assertOpen();
    if (this.#delivery === undefined) throw new Error("NLE Studio video delivery is unavailable.");
    return this.#delivery.observe(handle);
  }

  cancelDelivery(handle: NleDeliveryActionHandle): NleDeliveryActionObservation {
    this.#assertOpen();
    if (this.#delivery === undefined) throw new Error("NLE Studio video delivery is unavailable.");
    return this.#delivery.cancel(handle);
  }

  async save(): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    await nleProjectOwnerProvider.save(this.#context, this.#projectDocument, this.#projectLease.service);
    if (this.#viewDocument !== undefined && this.#viewLease !== undefined) {
      await nleViewOwnerProvider.save(this.#context, this.#viewDocument, this.#viewLease.service);
    }
    return this.#observationReceipt("document.save", []);
  }

  async reload(): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    await nleProjectOwnerProvider.reload(this.#context, this.#projectDocument, this.#projectLease.service);
    if (this.#viewDocument !== undefined && this.#viewLease !== undefined) {
      await nleViewOwnerProvider.reload(this.#context, this.#viewDocument, this.#viewLease.service);
      assertViewDocumentTarget(this.#project, this.#projectDocument, this.#viewDocument, this.#viewLease.service);
    } else {
      const before = this.#viewService.snapshot();
      this.#viewService.reload(
        sessionView(this.#projectLease.service, this.#projectDocument, this.#viewService),
        before.revision,
      );
    }
    return {
      operation: "document.reload",
      status: this.#surface.status(),
      changed: { project: true, view: true },
      invalidated: ["project", "timeline", "canvas", "inspector", "media", "preview"],
    };
  }

  close(): void {
    if (this.closed.aborted) return;
    this.#lifetime.abort();
    this.#unsubscribeSurface();
    this.#unsubscribeMedia();
    for (const unsubscribe of this.#deliverySubscriptions.values()) unsubscribe();
    this.#deliverySubscriptions.clear();
    this.#listeners.clear();
    this.#surface.close();
    this.#delivery?.close();
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

export type NleStudioProductProviderOptions = {
  readonly deliveryExecutor?: HtmlVideoExecutor;
  readonly mediaTools?: LocalMediaToolchainOptions;
};

/** Compose the Product Provider with its optional preview, delivery and local-media dependencies. */
export function createNleStudioProductProvider(
  options: NleStudioProductProviderOptions = {},
): ApplicationProductProvider {
  return {
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
          const result = await media.adoptFile!({ ...request, mediaType }, {
            inspect: async (path, context) => await inspectMediaFileFromContainerIndex(path, {
              ...(options.mediaTools?.ffprobePath === undefined ? {} : { ffprobePath: options.mediaTools.ffprobePath }),
              ...(context.signal === undefined ? {} : { signal: context.signal }),
              ...(mediaType.startsWith("image/") ? { constantPicture: true } : {}),
            }),
            select: (inspection) => defaultMediaSelection(inspection, mediaType),
          });
          return { reference: result.reference };
        },
      };
      const delivery = options.deliveryExecutor === undefined ? undefined : openNleDeliveryService({
        host: project,
        executor: options.deliveryExecutor,
      });
      try {
        return await openNleStudioProductSession({
          project,
          document: selected.document,
          ...(selected.viewDocument === undefined ? {} : { viewDocument: selected.viewDocument }),
          ...(selected.preview === undefined ? {} : { preview: selected.preview }),
          ...(mediaImport === undefined ? {} : { mediaImport }),
          ...(delivery === undefined ? {} : { delivery }),
        });
      } catch (error) {
        delivery?.close();
        throw error;
      }
    },
  };
}

export const nleStudioProductProvider = createNleStudioProductProvider();

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

import { randomUUID } from "node:crypto";
import { dirname, posix, relative, resolve, sep } from "node:path";
import type { ApplicationProductProvider } from "@hypit/application";
import type { HtmlFrameExecutor, HtmlVideoExecutor } from "@hypit/html-video";
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
  applyNleTransaction,
  createComponentMaterialization,
  createCompositionMaterialization,
  createMediaAssetMaterialization,
  createTransitionMaterialization,
  indexNleProject,
  nleCompositionDuration,
  nleItemEnd,
  nleLinearTimeMapping,
  planNleComponentValueEdit,
  type NleCommand,
  type NleProjectService,
  type NleTrack,
} from "@hypit/nle";
import { assertTemporalMapPieces, compareExactTemporalValues, sealLocalTemporalDomain, type ExactTemporalValue } from "@hypit/temporal/algebra";
import {
  acceptsNleComponentMedia,
  assertNleViewForProject,
  createNleComponentAuthoringContext,
  createNleView,
  nleViewTrackLocked,
  openNleViewService,
  planNleComponentMediaEdit,
  type NleEditGroup,
  type NleViewService,
} from "@hypit/nle/view";
import {
  openNleEditingSurface,
  NleEditingSurfaceRevisionConflict,
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
import { captureStudioClipboard, planStudioPaste, type StudioClipboard } from "./clipboard.js";
import { planCompound, planExplodeComposition, planUniqueComposition } from "./composition-planning.js";
import {
  nleProjectOwnerProvider,
  nleViewOwnerProvider,
} from "./owner-providers.js";
import {
  createNleStudioPackageBridge,
  type NleStudioPackageBridge,
} from "./packages.js";
import { allocateTimelinePlacement, planTimelineDrop, planTimelineEdit, planTimelineInsertion, studioFrameTime } from "./timeline-planning.js";
import { observeTimelineMedia } from "./timeline-media.js";
import { NleStudioPreview } from "./preview.js";
import { NleStudioMediaViews } from "./media-views.js";
import type {
  NleStudioActionObservation,
  NleStudioActionRequest,
  NleStudioCatalogProjection,
  NleStudioClipboardProjection,
  NleStudioComponentInputsProjection,
  NleStudioEvent,
  NleStudioEventListener,
  NleStudioInvalidation,
  NleStudioMediaProjection,
  NleStudioObservation,
  NleStudioObservationRequest,
  NleStudioOpenProjection,
  NleStudioOperation,
  NleStudioOperationReceipt,
  NleStudioPreviewProjection,
  NleStudioTimelineProjection,
} from "./protocol.js";

export type OpenNleStudioProductSessionOptions = {
  readonly project: ProjectHost;
  readonly document: string;
  readonly viewDocument?: string;
  readonly frameExecutor?: HtmlFrameExecutor;
  readonly playbackExecutor?: HtmlVideoExecutor;
  readonly mediaViews?: LocalMediaToolchainOptions;
  readonly mediaImport?: NleStudioMediaImportPort;
  readonly delivery?: NleDeliveryService;
};

export type NleStudioProductInput = {
  readonly document: string;
  readonly viewDocument?: string;
};

export type NleStudioMediaImportRequest = {
  readonly sourcePath: string;
  readonly sourceName: string;
};

export type NleStudioMediaImportPort = {
  adopt(request: NleStudioMediaImportRequest): Promise<{ readonly reference: { readonly path: string } }>;
};

export const nleStudioProduct = "hypit.nle-studio";

type NestedVisit = { readonly parent: string; readonly child: string; readonly frame: number };

class NleStudioMediaRevisionConflict extends Error {
  constructor(expected: number, actual: number) {
    super(`Project Media Catalog changed: expected generation ${expected}, found ${actual}.`);
    this.name = "NleStudioMediaRevisionConflict";
  }
}

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
  readonly #preview: NleStudioPreview | undefined;
  readonly #mediaViews: NleStudioMediaViews | undefined;
  readonly #mediaImport: NleStudioMediaImportPort | undefined;
  readonly #delivery: NleDeliveryService | undefined;
  readonly #mediaResources = new Map<string, Promise<ProjectHostResource>>();
  readonly #mediaTokens = new Set<string>();
  readonly #listeners = new Set<NleStudioEventListener>();
  readonly #deliverySubscriptions = new Map<string, () => void>();
  readonly #deliveryHandles = new Set<NleDeliveryActionHandle>();
  readonly #unsubscribeSurface: () => void;
  readonly #unsubscribeMedia: () => void;
  #mediaGeneration = -1;
  #clipboard: StudioClipboard | undefined;
  #pastedGroups: { readonly composition: string; readonly groups: readonly NleEditGroup[] } | undefined;
  #navigation: readonly NestedVisit[] = [];
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
    frameExecutor: HtmlFrameExecutor | undefined;
    playbackExecutor: HtmlVideoExecutor | undefined;
    mediaViews: LocalMediaToolchainOptions | undefined;
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
    this.#preview = value.frameExecutor === undefined ? undefined : new NleStudioPreview({
      host: value.project, document: value.projectDocument, frame: value.frameExecutor,
      ...(value.playbackExecutor === undefined ? {} : { video: value.playbackExecutor }),
      ...(value.mediaViews === undefined ? {} : { mediaTools: value.mediaViews }),
      publish: action => this.#publishAction(action),
    });
    this.#mediaViews = value.mediaViews === undefined ? undefined
      : new NleStudioMediaViews(value.project, value.mediaViews, action => this.#publishAction(action));
    this.#mediaImport = value.mediaImport;
    this.#delivery = value.delivery;
    this.#unsubscribeSurface = this.#surface.subscribe((change) => {
      if (change.kind !== "savepoint") this.#preview?.invalidate();
      const invalidated: NleStudioInvalidation[] = change.kind === "savepoint" ? []
        : change.owner === "project"
          ? ["project", "timeline", "canvas", "inspector", "preview"]
          : ["timeline", "canvas", "inspector", "media", "preview"];
      if (change.kind !== "savepoint" && this.#pastedGroups !== undefined) invalidated.push("clipboard");
      this.#emit({
        scope: "product",
        kind: `${change.owner}.${change.kind}`,
        status: change.status,
        invalidated,
      });
    });
    this.#unsubscribeMedia = this.#project.subscribe((event) => {
      if (event.kind !== "media.catalog") return;
      this.#preview?.invalidate();
      this.#mediaViews?.invalidate();
      this.#emit({
        scope: "project",
        kind: "media.catalog",
        status: this.#surface.status(),
        invalidated: ["media", "preview"],
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
        frameExecutor: options.frameExecutor,
        playbackExecutor: options.playbackExecutor,
        mediaViews: options.mediaViews,
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

  #publishAction({ handle, kind, progress, state }: NleStudioActionObservation): void {
    this.#emit({ scope: "action", kind, action: { handle, progress, state } });
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
      generation: catalog.generation,
      derivedViews: this.#mediaViews !== undefined,
      entries: await Promise.all(catalog.entries.map(async (entry) => {
        const name = mediaName(entry.reference.path);
        if (entry.state === "invalid") {
          return { id: entry.reference.path, name, kind: "unknown" as const, state: "invalid" as const,
            diagnostic: entry.diagnostic };
        }
        const kind = entry.picture === undefined ? "audio" as const
          : entry.audio ? "audiovisual" as const : "picture" as const;
        const picture = entry.picture === undefined ? {} : { pictureKind: entry.picture.kind };
        const projectedFrames = entry.duration === undefined ? undefined : Math.round(
          Number(entry.duration.ticks) * entry.duration.timeBase.numerator / entry.duration.timeBase.denominator
            * editRate.numerator / editRate.denominator,
        );
        const durationFrames = projectedFrames !== undefined && Number.isSafeInteger(projectedFrames)
          && projectedFrames > 0 ? projectedFrames : undefined;
        if (entry.state === "missing") {
          return { id: entry.reference.path, name, kind, ...picture, state: "missing" as const, mediaType: entry.mediaType,
            ...(durationFrames === undefined ? {} : { durationFrames }),
            ...(entry.diagnostic === undefined ? {} : { diagnostic: entry.diagnostic }) };
        }
        try {
          const resource = await this.#openMediaResource(entry.reference.path);
          return { id: entry.reference.path, name, kind, ...picture, state: "available" as const, mediaType: entry.mediaType,
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
    if (this.#mediaTokens.has(token)) return this.#project.resources.resolve(token);
    const preview = this.#preview?.resource(token);
    if (preview !== undefined) return preview;
    const mediaView = this.#mediaViews?.resource(token);
    if (mediaView !== undefined) return mediaView;
    if (this.#deliveryHandles.has(token)) {
      const delivery = this.#delivery!.observe(token);
      if (delivery.state === "complete") return delivery.result;
    }
    throw new Error(`NLE Studio resource ${token} is unavailable in this Session.`);
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
      processes: this.#packages.processes.map(entry => ({
        package: entry.package, offering: entry.id, title: entry.title, medium: entry.value.medium,
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
    const visit = this.#navigation.at(-1);
    return {
      scene: observation.value,
      canReturn: visit?.child === composition.id && project.compositions.some(entry => entry.id === visit.parent),
      compositions: project.compositions.map((value) => ({ id: value.id, name: value.name })),
      itemMedia: composition.tracks.flatMap((track) => track.items.flatMap((item) => {
        if (item.kind !== "present" || item.source !== "media") return [];
        return [{ item: item.id, media: this.#mediaIdentity(item.asset.path, item.id) }];
      })),
    };
  }

  #mediaIdentity(path: string, item: string): string {
    const root = this.#project.boundary.root;
    const directory = dirname(resolve(root, this.#projectDocument));
    const local = relative(root, resolve(directory, path));
    if (local === "" || local === ".." || local.startsWith(`..${sep}`)) {
      throw new Error(`NLE Item ${item} references Media outside the Project Boundary.`);
    }
    return local.split(sep).join("/");
  }

  async #resolveMediaBinding(media: string) {
    const catalog = await this.#project.media.observe();
    const entry = catalog.entries.find(candidate => candidate.reference.path === media);
    if (entry?.state !== "available") throw new Error(`Project Media ${media} is unavailable.`);
    const { media: { interpretation } } = await this.#project.media.open(entry.reference);
    const root = this.#project.boundary.root;
    const path = relative(dirname(resolve(root, this.#projectDocument)), resolve(root, media)).split(sep).join("/");
    return { asset: { path }, interpretation };
  }

  #componentInputs(id: string): NleStudioComponentInputsProjection {
    const { project } = this.#projectLease.service.snapshot();
    const { view } = this.#viewService.snapshot();
    const located = indexNleProject(project).item(id);
    if (located === undefined || located.composition.id !== view.activeComposition
      || located.item.kind !== "present" || located.item.source !== "component") {
      return { item: id, editable: false, inputs: [] };
    }
    const { item, track, composition } = located;
    return {
      item: id,
      editable: !nleViewTrackLocked(view, composition.id, track.id),
      inputs: this.#packages.authoring.componentMediaInputs({ project, item, track, composition }).map(input => {
        const reference = item.media?.[input.slot];
        return { ...input, ...(reference === undefined ? {} : { media: this.#mediaIdentity(reference.path, item.id) }) };
      }),
    };
  }

  #clipboardProjection(): NleStudioClipboardProjection {
    const pasted = this.#pastedGroups;
    let pendingGroups = 0;
    if (pasted !== undefined && pasted.composition === this.#viewService.snapshot().view.activeComposition) {
      const composition = this.#projectLease.service.snapshot().project.compositions
        .find(entry => entry.id === pasted.composition);
      const items = new Set(composition?.tracks.flatMap(track => track.items.map(item => item.id)));
      if (pasted.groups.every(group => group.items.every(item => items.has(item)))) pendingGroups = pasted.groups.length;
    }
    return {
      items: this.#clipboard?.count ?? 0,
      groups: this.#clipboard?.groups.length ?? 0,
      pendingGroups,
    };
  }

  #clipboardChanged(receipt: NleStudioOperationReceipt): NleStudioOperationReceipt {
    this.#emit({ scope: "product", kind: "clipboard.changed", status: receipt.status, invalidated: ["clipboard"] });
    return { ...receipt, invalidated: [...new Set<NleStudioInvalidation>([...receipt.invalidated, "clipboard"])] };
  }

  #canvas() {
    const observation = this.#surface.observe({ kind: "canvas" });
    if (observation.kind !== "canvas") throw new Error("NLE Studio received an invalid Canvas projection.");
    return observation.value;
  }

  async #openProjection(): Promise<NleStudioOpenProjection> {
    const media = await this.#projectMedia();
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
      preview: this.#previewProjection(),
      delivery: { state: this.#delivery === undefined ? "unavailable" : "available" },
      clipboard: this.#clipboardProjection(),
    };
  }

  #projectProjection(): NleStudioOpenProjection["project"] {
    return { name: this.#projectLease.service.snapshot().project.name, document: this.#projectDocument };
  }

  #previewProjection(): NleStudioPreviewProjection {
    return this.#preview === undefined ? { state: "unavailable" }
      : { state: "available", playback: this.#preview.playback, waveform: this.#preview.waveform,
        generation: this.#preview.generation };
  }

  async observe(request: NleStudioObservationRequest): Promise<NleStudioObservation> {
    this.#assertOpen();
    switch (request.kind) {
      case "open": return { kind: "open", value: await this.#openProjection() };
      case "project": return { kind: "project", value: this.#projectProjection() };
      case "status": return { kind: "status", value: this.#surface.status() };
      case "timeline": return { kind: "timeline", value: this.#timeline() };
      case "timeline-media": {
        const catalog = await this.#project.media.observe();
        this.#assertOpen();
        const snapshot = this.#projectLease.service.snapshot();
        const { view, revision } = this.#viewService.snapshot();
        if (snapshot.revision !== request.expectedProjectRevision) {
          throw new NleEditingSurfaceRevisionConflict("project", request.expectedProjectRevision, snapshot.revision);
        }
        if (revision !== request.expectedViewRevision) {
          throw new NleEditingSurfaceRevisionConflict("view", request.expectedViewRevision, revision);
        }
        if (catalog.generation !== request.expectedMediaGeneration) {
          throw new NleStudioMediaRevisionConflict(request.expectedMediaGeneration, catalog.generation);
        }
        const composition = snapshot.project.compositions.find(value => value.id === request.composition);
        if (composition === undefined || composition.id !== view.activeComposition) {
          throw new Error(`NLE Studio Timeline Media targets inactive Composition ${request.composition}.`);
        }
        return {
          kind: "timeline-media",
          value: this.#mediaViews === undefined ? [] : observeTimelineMedia({
            composition, rate: view.editRate, request, catalog, mediaIdentity: item => this.#mediaIdentity(item.asset.path, item.id),
          }),
        };
      }
      case "canvas": return { kind: "canvas", value: this.#canvas() };
      case "inspector": {
        const observation = this.#surface.observe({ kind: "inspector", item: request.item });
        if (observation.kind !== "inspector") throw new Error("NLE Studio received an invalid Inspector projection.");
        return { kind: "inspector", value: observation.value };
      }
      case "component-inputs": return { kind: "component-inputs", value: this.#componentInputs(request.item) };
      case "clipboard": return { kind: "clipboard", value: this.#clipboardProjection() };
      case "media": return { kind: "media", value: await this.#projectMedia() };
      case "catalog": return { kind: "catalog", value: this.#catalog() };
      case "preview": return { kind: "preview", value: this.#previewProjection() };
      case "action": return { kind: "action", value: this.observeAction(request.handle) };
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
    if (this.#pastedGroups !== undefined && (receipt.changed.project || receipt.changed.view)) invalidated.add("clipboard");
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

  async operate(operation: NleStudioOperation): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    const projectSnapshot = this.#projectLease.service.snapshot();
    const viewSnapshot = this.#viewService.snapshot();
    if (projectSnapshot.revision !== operation.expectedProjectRevision) {
      throw new NleEditingSurfaceRevisionConflict("project", operation.expectedProjectRevision, projectSnapshot.revision);
    }
    if (viewSnapshot.revision !== operation.expectedViewRevision) {
      throw new NleEditingSurfaceRevisionConflict("view", operation.expectedViewRevision, viewSnapshot.revision);
    }
    const { project } = projectSnapshot;
    const { view } = viewSnapshot;
    assertNleViewForProject(view, project);
    const composition = project.compositions.find(entry => entry.id === operation.composition);
    if (composition === undefined || view.activeComposition !== composition.id) {
      throw new Error(`NLE Studio Operation targets inactive Composition ${operation.composition}.`);
    }
    const commit = (commands: readonly NleCommand[], result: NleStudioOperationReceipt["result"]) => {
      this.#assertOpen();
      if (commands.length === 0) return this.#observationReceipt(operation.kind, [], result);
      return this.#receipt(operation.kind, this.#surface.command({
        kind: "project.transact",
        expectedProjectRevision: projectSnapshot.revision,
        expectedViewRevision: viewSnapshot.revision,
        commands,
      }), result);
    };
    const frameTime = (value: number) => studioFrameTime(value, view.editRate);
    const durationOverride = "durationFrames" in operation ? operation.durationFrames : undefined;
    if (durationOverride !== undefined && (!Number.isSafeInteger(durationOverride) || durationOverride <= 0)) {
      throw new Error("NLE Studio occurrence duration must be a positive safe integer.");
    }
    if ("atFrame" in operation && (!Number.isSafeInteger(operation.atFrame) || operation.atFrame < 0)) {
      throw new Error("NLE Studio placement frame must be a non-negative safe integer.");
    }
    const duration = durationOverride === undefined ? undefined : frameTime(durationOverride);
    const context = { project, view, composition };
    const currentItems = () => composition.tracks.flatMap(track => track.items);
    const identity = (role: string) => `${role}-${randomUUID()}`;
    const placePresent = (
      input: { readonly track?: string; readonly insertTracks?: readonly string[] },
      medium: NleTrack["kind"],
      start: ExactTemporalValue,
      length: ExactTemporalValue,
    ) => {
      const purpose = { kind: "present", start, duration: length } as const;
      const placement = allocateTimelinePlacement(context, { medium, track: input.track, purpose });
      if (input.insertTracks === undefined) return placement;
      if (input.track === undefined) throw new Error("NLE Studio insertion requires a destination Track.");
      const commands = planTimelineInsertion(context, input.track, input.insertTracks, start, length);
      return { ...placement, commands };
    };
    const navigate = (target: string, frame: number, next: readonly NestedVisit[]) => {
      if (!project.compositions.some(entry => entry.id === target)) throw new Error(`Unknown NLE Composition ${target}.`);
      const previous = this.#navigation;
      this.#navigation = next;
      try {
        return this.#receipt(operation.kind, this.#surface.command({
          kind: "view.transact", expectedProjectRevision: projectSnapshot.revision, expectedViewRevision: viewSnapshot.revision,
          commands: [{ kind: "view.update", activeComposition: target }],
        }), { composition: target, frame });
      } catch (error) {
        this.#navigation = previous;
        throw error;
      }
    };

    switch (operation.kind) {
      case "timeline.drop": {
        const plan = planTimelineDrop(project, view, operation);
        return commit(plan.commands, { track: plan.anchorTrack });
      }
      case "timeline.trim":
      case "timeline.slip":
      case "timeline.roll":
      case "timeline.ripple-trim":
      case "timeline.split":
      case "timeline.remove":
      case "timeline.ripple-remove":
      case "timeline.close-gap": {
        const plan = planTimelineEdit(context, operation);
        if (plan.commands.length > 0 && (operation.kind === "timeline.slip" || operation.kind === "timeline.roll"
            || operation.kind === "timeline.ripple-trim" || operation.kind === "timeline.trim")) {
          const planned = applyNleTransaction(project, { commands: plan.commands });
          const original = indexNleProject(project);
          const index = indexNleProject(planned);
          const subjects = operation.kind === "timeline.roll" ? [operation.left, operation.right] : [operation.item];
          await Promise.all(subjects.map(async (id) => {
            const item = index.item(id)!.item;
            const previous = original.item(id)!.item;
            if (item.kind !== "present" || item.source !== "media") return;
            const expands = compareExactTemporalValues(item.start, previous.start) < 0
              || compareExactTemporalValues(nleItemEnd(item), nleItemEnd(previous)) > 0;
            if (operation.kind !== "timeline.slip" && !expands) return;
            const { interpretation } = await this.#resolveMediaBinding(this.#mediaIdentity(item.asset.path, id));
            if (interpretation.domain === undefined) {
              if (operation.kind === "timeline.slip") throw new Error(`NLE Item ${id} has no timed Media to slip.`);
              return;
            }
            assertTemporalMapPieces(item.sourceTime.pieces,
              sealLocalTemporalDomain({ id: `${id}:time`, duration: item.duration }), interpretation.domain);
          }));
        }
        return commit(plan.commands, { count: plan.count });
      }
      case "clipboard.copy":
      case "clipboard.cut": {
        const clipboard = captureStudioClipboard(composition, view, operation.items);
        const commands = operation.kind === "clipboard.cut"
          ? planTimelineEdit(context, { ...operation, kind: "timeline.remove" }).commands
          : [];
        const receipt = commit(commands, { count: clipboard.count });
        this.#clipboard = clipboard;
        this.#pastedGroups = undefined;
        return this.#clipboardChanged(receipt);
      }
      case "clipboard.paste": {
        if (this.#clipboard === undefined) throw new Error("NLE Studio clipboard is empty.");
        const plan = planStudioPaste(this.#clipboard, composition, view, frameTime(operation.atFrame));
        const receipt = commit(plan.commands, { item: plan.items[0]!, count: plan.items.length });
        this.#pastedGroups = plan.groups.length === 0 ? undefined : { composition: composition.id, groups: plan.groups };
        return this.#clipboardChanged(receipt);
      }
      case "clipboard.apply-groups": {
        const pasted = this.#pastedGroups;
        if (pasted?.composition !== composition.id || this.#clipboardProjection().pendingGroups === 0) {
          throw new Error(`NLE Studio clipboard has no pasted Groups for ${composition.id}.`);
        }
        const receipt = this.#receipt(operation.kind, this.#surface.command({
          kind: "view.transact", expectedProjectRevision: projectSnapshot.revision, expectedViewRevision: viewSnapshot.revision,
          commands: pasted.groups.map(group => ({ kind: "group.add", composition: composition.id, group })),
        }), { count: pasted.groups.length });
        this.#pastedGroups = undefined;
        return this.#clipboardChanged(receipt);
      }
      case "media.materialize": {
        const { asset, interpretation } = await this.#resolveMediaBinding(operation.media);
        const at = frameTime(operation.atFrame);
        const length = duration ?? interpretation.domain?.duration
          ?? frameTime(Math.max(1, Math.round(5 * view.editRate.numerator / view.editRate.denominator)));
        if (interpretation.domain !== undefined && compareExactTemporalValues(length, interpretation.domain.duration) > 0) {
          throw new Error(`NLE Studio placement duration exceeds Project Media ${operation.media}.`);
        }
        const requested = composition.tracks.find(track => track.id === operation.track);
        const medium = interpretation.picture === undefined || requested?.kind === "audio" ? "audio" : "picture";
        const placement = placePresent(operation, medium, at, length);
        const item = identity("media");
        const materialization = createMediaAssetMaterialization(placement.project, {
          itemId: item, asset, interpretation, track: placement.track, at, duration: length,
          ...(operation.includeAudio === undefined ? {} : { audio: operation.includeAudio ? {} : false }),
          ...(operation.layout === undefined ? {} : { picture: { layout: operation.layout } }),
        });
        return commit([...placement.commands, ...materialization.commands], { item, track: placement.track });
      }
      case "component.materialize": {
        const offering = this.#packages.component(operation.package, operation.offering);
        if (offering === undefined) {
          throw new Error(`NLE Studio Component offering ${operation.package}#${operation.offering} is not selected.`);
        }
        const at = frameTime(operation.atFrame);
        const length = duration ?? offering.value.duration;
        const placement = placePresent(operation, "picture", at, length);
        const item = identity("component");
        const valueBindings = Object.entries(offering.value.values ?? {}).map(([slot, value]) =>
          ({ slot, kind: "inline" as const, value }));
        const creation = {
          id: item, track: placement.track, component: offering.value.component, parameters: offering.value.parameters,
          at, duration: length, ...(offering.value.layout === undefined ? {} : { layout: offering.value.layout }),
          ...(valueBindings.length === 0 ? {} : { valueBindings }),
        };
        let materialization = createComponentMaterialization(placement.project, creation);
        const selections = Object.entries(operation.values ?? {});
        const seeds = Object.entries(operation.media ?? {});
        const valueCommands: NleCommand[] = [];
        if (selections.length > 0 || seeds.length > 0) {
          const draft = applyNleTransaction(placement.project, materialization);
          for (const [slot, selection] of selections) {
            if (!valueBindings.some(binding => binding.slot === slot)) {
              throw new Error(`NLE Studio Component offering ${operation.offering} has no value slot ${slot}.`);
            }
            valueCommands.push(...planNleComponentValueEdit(draft, item, selection.kind === "link"
              ? { kind: "link", slot, ref: selection.ref }
              : { kind: "share", slot, name: selection.name, id: identity("value") },
            ).commands);
          }
          if (seeds.length > 0) {
            const configured = valueCommands.length === 0 ? draft : applyNleTransaction(draft, { commands: valueCommands });
            const inputs = this.#packages.authoring.componentMediaInputs(createNleComponentAuthoringContext(configured, item));
            const bindings = await Promise.all(seeds.map(async ([slot, media]) => {
              const input = inputs.find(candidate => candidate.slot === slot);
              if (input === undefined) throw new Error(`NLE Component ${item} does not declare Media input ${slot}.`);
              const binding = await this.#resolveMediaBinding(media);
              if (!acceptsNleComponentMedia(input, binding.interpretation)) {
                throw new Error(`Project Media ${media} does not satisfy Component ${item} input ${slot}.`);
              }
              return [slot, binding.asset] as const;
            }));
            materialization = createComponentMaterialization(placement.project, { ...creation, media: Object.fromEntries(bindings) });
          }
        }
        return commit([...placement.commands, ...materialization.commands, ...valueCommands], { item, track: placement.track });
      }
      case "adjust.materialize": {
        const offering = this.#packages.adjust(operation.package, operation.offering);
        if (offering === undefined) {
          throw new Error(`NLE Studio Adjust offering ${operation.package}#${operation.offering} is not selected.`);
        }
        const placement = allocateTimelinePlacement(context, {
          medium: offering.value.medium, track: operation.track, purpose: { kind: "adjust" },
        });
        const item = identity("adjust");
        const materialization = createAdjustMaterialization(placement.project, {
          id: item, track: placement.track, operator: offering.value.operator,
          parameters: { kind: "inline", value: offering.value.parameters },
          at: frameTime(operation.atFrame), duration: duration ?? offering.value.duration,
        });
        return commit([...placement.commands, ...materialization.commands], { item, track: placement.track });
      }
      case "process.materialize": {
        const offering = this.#packages.process(operation.package, operation.offering);
        if (offering === undefined) {
          throw new Error(`NLE Studio Process offering ${operation.package}#${operation.offering} is not selected.`);
        }
        const item = currentItems().find(entry => entry.id === operation.item);
        const { medium, operator, parameters } = offering.value;
        if (item?.kind !== "present" || item[medium] === undefined) {
          throw new Error(`NLE Studio Process ${operation.offering} requires a Present with ${medium} in ${composition.id}.`);
        }
        const process = identity("process");
        return commit([{
          kind: "process.add", item: item.id, medium, process: {
            id: process, operator, parameters: { kind: "inline", value: parameters }, enabled: true,
            controlTime: nleLinearTimeMapping(item.duration),
          },
          ...(operation.before === undefined ? {} : { before: operation.before }),
        }], { item: item.id, process });
      }
      case "process.enable":
      case "process.move":
      case "process.remove": {
        const item = currentItems().find(entry => entry.id === operation.item);
        const process = item?.kind === "present" ? item[operation.medium]?.processes?.find(entry => entry.id === operation.process)
          : undefined;
        if (process === undefined) throw new Error(`NLE Item ${operation.item} has no ${operation.medium} Process ${operation.process}.`);
        const address = { item: operation.item, medium: operation.medium };
        const result = { item: operation.item, process: operation.process };
        if (operation.kind === "process.enable") {
          return commit(process.enabled === operation.enabled ? [] : [{
            kind: "process.replace", ...address, process: { ...process, enabled: operation.enabled },
          }], result);
        }
        if (operation.kind === "process.remove") return commit([{ kind: "process.remove", ...address, id: process.id }], result);
        return commit(operation.before === process.id ? [] : [{
          kind: "process.move", ...address, id: process.id, ...(operation.before === undefined ? {} : { before: operation.before }),
        }], result);
      }
      case "transition.materialize": {
        const offering = this.#packages.transition(operation.package, operation.offering);
        if (offering === undefined) {
          throw new Error(`NLE Studio Transition offering ${operation.package}#${operation.offering} is not selected.`);
        }
        const items = currentItems().filter(item => operation.items.includes(item.id))
          .sort((left, right) => compareExactTemporalValues(left.start, right.start));
        if (items.length !== 2) throw new Error("NLE Studio Transition requires two Items in the active Composition.");
        const transition = identity("transition");
        const materialization = createTransitionMaterialization(project, {
          id: transition, composition: composition.id, outgoing: items[0]!.id, incoming: items[1]!.id,
          operator: offering.value.operator, parameters: offering.value.parameters,
          duration: duration ?? offering.value.duration,
        });
        return commit(materialization.commands, { transition });
      }
      case "composition.materialize": {
        const source = project.compositions.find(entry => entry.id === operation.source);
        if (source === undefined) throw new Error(`Unknown NLE Composition ${operation.source}.`);
        const at = frameTime(operation.atFrame);
        const requested = composition.tracks.find(track => track.id === operation.track);
        const picture = source.tracks.some(track => track.enabled && track.items.some(item =>
          item.kind === "present" && item.enabled && item.picture !== undefined));
        const medium = picture && requested?.kind !== "audio" ? "picture" : "audio";
        const placement = placePresent(operation, medium, at, nleCompositionDuration(source));
        const item = identity("composition");
        const materialization = createCompositionMaterialization(placement.project, {
          id: item, track: placement.track, composition: source.id, at,
        });
        return commit([...placement.commands, ...materialization.commands], { item, track: placement.track });
      }
      case "composition.compound": {
        const plan = planCompound(project, composition, operation.items, operation.name);
        return commit(plan.commands, { item: plan.item, composition: plan.composition });
      }
      case "composition.make-unique": {
        const plan = planUniqueComposition(project, composition, operation.item);
        return commit(plan.commands, { item: plan.item, composition: plan.composition });
      }
      case "composition.explode": {
        const plan = planExplodeComposition(project, composition, operation.item);
        return commit(plan.commands, { item: plan.item, count: plan.count });
      }
      case "composition.select":
        return operation.target === composition.id
          ? commit([], { composition: composition.id })
          : navigate(operation.target, 0, []);
      case "composition.enter": {
        const item = currentItems().find(entry => entry.id === operation.item);
        if (item?.kind !== "present" || item.source !== "composition") {
          throw new Error(`NLE Item ${operation.item} is not a Composition Present in ${composition.id}.`);
        }
        const previous = this.#navigation.at(-1)?.child === composition.id ? this.#navigation : [];
        return navigate(item.composition, 0, [
          ...previous, { parent: composition.id, child: item.composition, frame: operation.atFrame },
        ]);
      }
      case "composition.return": {
        const visit = this.#navigation.at(-1);
        if (visit?.child !== composition.id) throw new Error(`NLE Studio has no parent visit for ${composition.id}.`);
        return navigate(visit.parent, visit.frame, this.#navigation.slice(0, -1));
      }
      case "audio.detach": {
        const source = currentItems().find(item => item.id === operation.item);
        if (source === undefined) throw new Error(`Unknown NLE Item ${operation.item} in Composition ${composition.id}.`);
        const placement = allocateTimelinePlacement(context, {
          medium: "audio", track: operation.track,
          purpose: { kind: "present", start: source.start, duration: source.duration },
        });
        const item = identity("audio");
        return commit([...placement.commands, {
          kind: "item.detach-audio", id: source.id, track: placement.track, audioItemId: item,
        }], { item, track: placement.track });
      }
      case "component-media.bind":
      case "component-media.unbind": {
        const located = indexNleProject(project).item(operation.item);
        if (located === undefined || located.composition.id !== composition.id
          || located.item.kind !== "present" || located.item.source !== "component") {
          throw new Error(`NLE Item ${operation.item} is not a Component Present in ${composition.id}.`);
        }
        const binding = operation.kind === "component-media.bind" ? await this.#resolveMediaBinding(operation.media) : undefined;
        const planned = planNleComponentMediaEdit(
          this.#packages.authoring, { project, composition, track: located.track, item: located.item }, operation.slot, binding,
        );
        return commit(planned.commands, { item: operation.item, slot: operation.slot });
      }
    }
  }

  async presentationResource(resource: string): Promise<{ readonly mediaType: string; readonly bytes: Uint8Array }> {
    this.#assertOpen();
    const value = this.#packages.timelinePresentation.resource(resource);
    if (value === undefined) throw new Error(`Unknown NLE Studio presentation resource: ${resource}.`);
    return { mediaType: value.mediaType, bytes: await value.read() };
  }

  #deliveryObservation(observation: NleDeliveryActionObservation): NleStudioActionObservation {
    const base = { handle: observation.handle, kind: "delivery" as const, progress: observation.progress };
    switch (observation.state) {
      case "complete": return { ...base, state: "complete", result: {
        resource: `api/resources/${encodeURIComponent(observation.handle)}`, mediaType: observation.result.mediaType,
      } };
      case "failed": return { ...base, state: "failed", diagnostic: observation.diagnostic };
      default: return { ...base, state: observation.state };
    }
  }

  async startAction(request: NleStudioActionRequest): Promise<NleStudioActionObservation> {
    this.#assertOpen();
    if ("expectedMediaGeneration" in request) {
      if (this.#mediaViews === undefined) throw new Error("NLE Studio Media views are unavailable.");
      const catalog = await this.#project.media.observe();
      this.#assertOpen();
      if (catalog.generation !== request.expectedMediaGeneration) {
        throw new NleStudioMediaRevisionConflict(request.expectedMediaGeneration, catalog.generation);
      }
      if (!catalog.entries.some(entry => entry.reference.path === request.media && entry.state === "available")) {
        throw new Error(`Project Media ${request.media} is unavailable.`);
      }
      return this.#mediaViews.start(request);
    }
    const snapshot = this.#projectLease.service.snapshot();
    if (snapshot.revision !== request.expectedProjectRevision) {
      throw new NleEditingSurfaceRevisionConflict("project", request.expectedProjectRevision, snapshot.revision);
    }
    if (request.kind !== "delivery") {
      const view = this.#viewService.snapshot();
      if (view.revision !== request.expectedViewRevision) {
        throw new NleEditingSurfaceRevisionConflict("view", request.expectedViewRevision, view.revision);
      }
      if (request.composition !== view.view.activeComposition) {
        throw new Error(`NLE Studio preview targets inactive Composition ${request.composition}.`);
      }
      if (this.#preview === undefined) throw new Error("NLE Studio preview is unavailable.");
      assertNleViewForProject(view.view, snapshot.project);
      return this.#preview.start(request, snapshot.project, view.view.editRate);
    }
    if (this.#delivery === undefined) throw new Error("NLE Studio video delivery is unavailable.");
    const handle = await this.#delivery.start({
      document: this.#projectDocument, destination: request.destination, profile: request.profile, snapshot: snapshot.project,
      ...(request.renderer === undefined ? {} : { renderer: request.renderer }),
    });
    this.#assertOpen();
    this.#deliveryHandles.add(handle);
    const unsubscribe = this.#delivery.subscribe(handle, (action) => {
      if (action.state !== "queued" && action.state !== "running") {
        this.#deliverySubscriptions.get(handle)?.();
        this.#deliverySubscriptions.delete(handle);
      }
      this.#publishAction(this.#deliveryObservation(action));
    });
    const current = this.#delivery.observe(handle);
    if (current.state === "queued" || current.state === "running") this.#deliverySubscriptions.set(handle, unsubscribe);
    else unsubscribe();
    return this.#deliveryObservation(current);
  }

  observeAction(handle: string): NleStudioActionObservation {
    this.#assertOpen();
    if (this.#deliveryHandles.has(handle)) return this.#deliveryObservation(this.#delivery!.observe(handle));
    const current = this.#preview?.observe(handle) ?? this.#mediaViews?.observe(handle);
    if (current !== undefined) return current;
    throw new Error(`NLE Studio Action ${handle} is unavailable in this Session.`);
  }

  cancelAction(handle: string): NleStudioActionObservation {
    this.#assertOpen();
    if (this.#deliveryHandles.has(handle)) return this.#deliveryObservation(this.#delivery!.cancel(handle));
    const current = this.#preview?.cancel(handle) ?? this.#mediaViews?.cancel(handle);
    if (current !== undefined) return current;
    throw new Error(`NLE Studio Action ${handle} is unavailable in this Session.`);
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

  async close(): Promise<void> {
    if (this.closed.aborted) return;
    this.#lifetime.abort();
    this.#clipboard = undefined;
    this.#pastedGroups = undefined;
    this.#navigation = [];
    this.#unsubscribeSurface();
    this.#unsubscribeMedia();
    for (const unsubscribe of this.#deliverySubscriptions.values()) unsubscribe();
    this.#deliverySubscriptions.clear();
    this.#deliveryHandles.clear();
    this.#listeners.clear();
    this.#surface.close();
    this.#delivery?.close();
    await Promise.all([this.#preview?.close(), this.#mediaViews?.close()]);
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
  if (Object.keys(selected).some(key => key !== "document" && key !== "viewDocument")) {
    throw new Error("NLE Studio Product input fields are invalid.");
  }
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
  };
}

export type NleStudioProductProviderOptions = {
  readonly frameExecutor?: HtmlFrameExecutor;
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
          ...(options.frameExecutor === undefined ? {} : { frameExecutor: options.frameExecutor }),
          ...(options.deliveryExecutor === undefined ? {} : { playbackExecutor: options.deliveryExecutor }),
          mediaViews: options.mediaTools ?? {},
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
  nleStudioProcessOfferingKind,
  nleStudioTransitionOfferingKind,
  type NleStudioAdjustOffering,
  type NleStudioAdjustOfferingValue,
  type NleStudioComponentCategory,
  type NleStudioComponentOffering,
  type NleStudioComponentOfferingValue,
  type NleStudioPackageBridge,
  type NleStudioProcessOffering,
  type NleStudioProcessOfferingValue,
  type NleStudioTransitionOffering,
  type NleStudioTransitionOfferingValue,
} from "./packages.js";

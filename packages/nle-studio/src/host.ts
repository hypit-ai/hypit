import { randomUUID } from "node:crypto";
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
  applyNleTransaction,
  createComponentMaterialization,
  createCompositionMaterialization,
  createMediaAssetMaterialization,
  createTransitionMaterialization,
  indexNleProject,
  nleCompositionDuration,
  type NleCommand,
  type NleProjectService,
} from "@hypit/nle";
import { compareExactTemporalValues } from "@hypit/temporal/algebra";
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
import {
  nleProjectOwnerProvider,
  nleViewOwnerProvider,
} from "./owner-providers.js";
import {
  createNleStudioPackageBridge,
  type NleStudioPackageBridge,
} from "./packages.js";
import { allocateTimelinePlacement, planTimelineDrop, planTimelineEdit, studioFrameTime } from "./timeline-planning.js";
import type {
  NleStudioCatalogProjection,
  NleStudioClipboardProjection,
  NleStudioComponentInputsProjection,
  NleStudioDeliveryStartRequest,
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
  #clipboard: StudioClipboard | undefined;
  #pastedGroups: { readonly composition: string; readonly groups: readonly NleEditGroup[] } | undefined;
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
    return {
      scene: observation.value,
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
      clipboard: this.#clipboardProjection(),
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
      case "component-inputs": return { kind: "component-inputs", value: this.#componentInputs(request.item) };
      case "clipboard": return { kind: "clipboard", value: this.#clipboardProjection() };
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

    switch (operation.kind) {
      case "timeline.drop": {
        const plan = planTimelineDrop(project, view, operation);
        return commit(plan.commands, { track: plan.anchorTrack });
      }
      case "timeline.trim":
      case "timeline.split":
      case "timeline.remove":
      case "timeline.ripple-remove":
      case "timeline.close-gap": {
        const plan = planTimelineEdit(context, operation);
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
        const requested = composition.tracks.find(track => track.id === operation.track);
        const medium = interpretation.picture === undefined || requested?.kind === "audio" ? "audio" : "picture";
        const placement = allocateTimelinePlacement(context, {
          medium, track: operation.track, purpose: { kind: "present", start: at, duration: length },
        });
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
        const placement = allocateTimelinePlacement(context, {
          medium: "picture", track: operation.track, purpose: { kind: "present", start: at, duration: length },
        });
        const item = identity("component");
        const creation = {
          id: item, track: placement.track, component: offering.value.component, parameters: offering.value.parameters,
          at, duration: length, ...(offering.value.layout === undefined ? {} : { layout: offering.value.layout }),
        };
        let materialization = createComponentMaterialization(placement.project, creation);
        if (operation.media !== undefined && Object.keys(operation.media).length > 0) {
          const draft = applyNleTransaction(placement.project, materialization);
          const inputs = this.#packages.authoring.componentMediaInputs(createNleComponentAuthoringContext(draft, item));
          const bindings = await Promise.all(Object.entries(operation.media).map(async ([slot, media]) => {
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
        return commit([...placement.commands, ...materialization.commands], { item, track: placement.track });
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
        const placement = allocateTimelinePlacement(context, {
          medium: picture && requested?.kind !== "audio" ? "picture" : "audio",
          track: operation.track, purpose: { kind: "present", start: at, duration: nleCompositionDuration(source) },
        });
        const item = identity("composition");
        const materialization = createCompositionMaterialization(placement.project, {
          id: item, track: placement.track, composition: source.id, at,
        });
        return commit([...placement.commands, ...materialization.commands], { item, track: placement.track });
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
    this.#clipboard = undefined;
    this.#pastedGroups = undefined;
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

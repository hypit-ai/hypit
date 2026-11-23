import { randomUUID } from "node:crypto";
import { dirname, posix, relative, resolve, sep } from "node:path";
import type { ApplicationProductProvider } from "@hypit/application";
import type { HtmlFrameExecutor, HtmlVideoExecutor } from "@hypit/html-video";
import type { NodeProjectMediaService } from "@hypit/media-asset/service/node";
import type { MediaAssetReference } from "@hypit/media-asset";
import type { ProjectMediaAssetEdit, ProjectMediaLibraryEdit } from "@hypit/media-asset/service";
import type { ProjectMediaCatalog, ProjectMediaCatalogEntry, ProjectMediaViewLease, ProjectMediaViewObservation } from "@hypit/media-asset/service";
import { defaultMediaSelection } from "@hypit/media";
import {
  inspectMediaFileForAdoption,
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
  nleProcessControlDuration,
  resolveNleProcessTime,
  planNleComponentValueEdit,
  type NleCommand,
  type NleComposition,
  type NleItem,
  type NleProject,
  type NleProjectService,
  type NleSourceTimeBounds,
  type NleTrack,
} from "@hypit/nle";
import {
  assertTemporalMapPieces, compareExactTemporalValues, evaluateTemporalMap, exactTemporalRational, sealLocalTemporalDomain,
  subtractExactTemporalValues, type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import {
  acceptsNleComponentMedia,
  createNleComponentAuthoringContext,
  planNleComponentMediaEdit,
  openNleEditingSurface,
  type NleEditingContext,
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
import { planCompound, planCopyComposition, planExplodeComposition, planUniqueComposition, projectCompositionTabs } from "./composition-planning.js";
import {
  nleProjectOwnerProvider,
  nodeNleProjectSavedAt,
  openNodeNleProject,
} from "@hypit/nle/node";
import { resolveNodeProjectFile } from "@hypit/project/node";
import {
  createNleStudioPackageBridge,
  type NleStudioPackageBridge,
} from "./packages.js";
import {
  allocateTimelinePlacement, assertTransitionMove, nleRetimeWindow, planAudioDetachment, planTimelineDrop, planTimelineEdit,
  planTimelineInsertion, planTimelineTrackReorder, planTransitionWindow, resolveTransitionCut, studioFrameTime,
} from "./timeline-planning.js";
import { renderedPreviewVersion, timelinePreviewSources } from "./timeline-media.js";
import { RenderedPicturePreviews } from "./rendered-picture-previews.js";
import { RenderedAudioPreviews } from "./rendered-audio-previews.js";
import { planTrimEdge, projectTrimRange } from "./trim-planning.js";
import { NleStudioPreview } from "./preview.js";
import { NleStudioProgramme } from "./programme.js";
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
  NleStudioStatus,
  NleStudioTimelineProjection,
} from "./protocol.js";

export type OpenNleStudioProductSessionOptions = {
  readonly project: ProjectHost;
  readonly document: string;
  readonly frameExecutor?: HtmlFrameExecutor;
  readonly playbackExecutor?: HtmlVideoExecutor;
  readonly mediaTools?: LocalMediaToolchainOptions;
  readonly mediaImport?: NleStudioMediaImportPort;
  readonly assertMediaUnused?: AssertMediaUnused;
  readonly delivery?: NleDeliveryService;
};

export type NleStudioProductInput = {
  readonly document: string;
};

export type NleStudioMediaImportRequest = {
  readonly sourcePath: string;
  readonly sourceName: string;
  readonly folder?: string;
};

export type NleStudioMediaImportPort = {
  adopt(request: NleStudioMediaImportRequest): Promise<{ readonly reference: { readonly path: string } }>;
};

type AssertMediaUnused = (project: ProjectHost, asset: MediaAssetReference) => Promise<void>;

export const nleStudioProduct = "hypit.nle-studio";
const projectFileOperations = new WeakMap<NleProjectService, Promise<void>>();

type NestedVisit = { readonly parent: string; readonly child: string; readonly at: ExactTemporalValue };

function mediaActionObservation(action: ProjectMediaViewObservation): NleStudioActionObservation {
  if (action.state !== "complete") return action;
  const url = (token: string) => `api/resources/${encodeURIComponent(token)}`;
  if (action.result.blocks === undefined) {
    return { ...action, result: { ...action.result, resource: url(action.result.resource) } };
  }
  return { ...action, result: { blocks: action.result.blocks.map(block => block.resource === undefined
    ? block : { ...block, resource: url(block.resource) }) } };
}

function mediaName(path: string): string {
  const name = posix.basename(path);
  return name.endsWith(".media.json") ? name.slice(0, -".media.json".length) : name;
}

type StudioEditingContext = NleEditingContext & {
  activeComposition: string;
  readonly lockedTracks: Set<string>;
};

export class NleStudioProductSession {
  readonly #project: ProjectHost;
  readonly #context: ProjectHostContext;
  readonly #projectDocument: string;
  readonly #projectLease: ProjectDocumentLease<NleProjectService>;
  readonly #editing: StudioEditingContext;
  readonly #surface: NleEditingSurface;
  readonly #packages: NleStudioPackageBridge;
  readonly #preview: NleStudioPreview | undefined;
  readonly #renderedPreviews: RenderedPicturePreviews | undefined;
  readonly #renderedAudio: RenderedAudioPreviews | undefined;
  readonly programme: NleStudioProgramme | undefined;
  readonly #mediaViews: ProjectMediaViewLease | undefined;
  readonly #mediaImport: NleStudioMediaImportPort | undefined;
  readonly #assertMediaUnused: AssertMediaUnused | undefined;
  readonly #delivery: NleDeliveryService | undefined;
  readonly #mediaResources = new Map<string, Promise<ProjectHostResource>>();
  readonly #mediaTokens = new Set<string>();
  readonly #listeners = new Set<NleStudioEventListener>();
  readonly #deliverySubscriptions = new Map<string, () => void>();
  readonly #deliveryHandles = new Set<NleDeliveryActionHandle>();
  readonly #unsubscribeSurface: () => void;
  readonly #unsubscribeMedia: () => void;
  #mediaGeneration = -1;
  #programmeMediaGeneration = 0;
  #clipboard: StudioClipboard | undefined;
  #navigation: readonly NestedVisit[] = [];
  readonly #lifetime = new AbortController();

  get closed(): AbortSignal {
    return this.#lifetime.signal;
  }

  private constructor(value: {
    project: ProjectHost;
    context: ProjectHostContext;
    projectDocument: string;
    projectLease: ProjectDocumentLease<NleProjectService>;
    editing: StudioEditingContext;
    surface: NleEditingSurface;
    packages: NleStudioPackageBridge;
    frameExecutor: HtmlFrameExecutor | undefined;
    playbackExecutor: HtmlVideoExecutor | undefined;
    mediaTools: LocalMediaToolchainOptions | undefined;
    mediaImport: NleStudioMediaImportPort | undefined;
    assertMediaUnused: AssertMediaUnused | undefined;
    delivery: NleDeliveryService | undefined;
  }) {
    this.#project = value.project;
    this.#context = value.context;
    this.#projectDocument = value.projectDocument;
    this.#projectLease = value.projectLease;
    this.#editing = value.editing;
    this.#surface = value.surface;
    this.#packages = value.packages;
    this.#preview = value.frameExecutor === undefined ? undefined : new NleStudioPreview({
      host: value.project, document: value.projectDocument, frame: value.frameExecutor,
      ...(value.playbackExecutor === undefined ? {} : { video: value.playbackExecutor }),
      ...(value.mediaTools === undefined ? {} : { mediaTools: value.mediaTools }),
      publish: action => this.#publishAction(action),
    });
    this.programme = value.frameExecutor === undefined ? undefined
      : new NleStudioProgramme(value.project, value.projectDocument, value.frameExecutor, value.mediaTools);
    if (value.frameExecutor?.openCapture !== undefined) {
      this.#renderedPreviews = new RenderedPicturePreviews(value.project, value.projectDocument,
        value.frameExecutor.openCapture.bind(value.frameExecutor), action => this.#publishAction(action));
    }
    if (value.mediaTools !== undefined) {
      this.#renderedAudio = new RenderedAudioPreviews(value.project, value.projectDocument,
        value.mediaTools, action => this.#publishAction(action));
    }
    this.#mediaViews = this.#project.media.views?.lease(action => this.#publishAction(action));
    this.#mediaImport = value.mediaImport;
    this.#assertMediaUnused = value.assertMediaUnused;
    this.#delivery = value.delivery;
    this.#unsubscribeSurface = this.#surface.subscribe((change) => {
      if (change.kind !== "savepoint") {
        this.#updateEditingContext(this.#projectLease.service.snapshot().project);
        this.#preview?.invalidate();
      }
      const invalidated: NleStudioInvalidation[] = change.kind === "savepoint" ? []
        : ["project", "timeline", "canvas", "inspector", "preview", "delivery"];
      this.#emit({
        scope: "product",
        kind: `project.${change.kind}`,
        status: this.#status(change.status),
        invalidated,
      });
    });
    this.#unsubscribeMedia = this.#project.subscribe((event) => {
      if (event.kind === "media.library") {
        this.#emit({ scope: "project", kind: event.kind, status: this.#status(), invalidated: event.invalidated });
        return;
      }
      if (event.kind !== "media.catalog") return;
      this.#programmeMediaGeneration = event.generation;
      this.#preview?.invalidate();
      this.#emit({
        scope: "project",
        kind: "media.catalog",
        status: this.#status(),
        invalidated: ["media", "media-library", "timeline", "preview"],
        generation: event.generation,
      });
    });
  }

  static async open(options: OpenNleStudioProductSessionOptions): Promise<NleStudioProductSession> {
    const projectContext = options.project;
    const projectLease = await openNodeNleProject(options.project, options.document);
    try {
      const editing: StudioEditingContext = {
        activeComposition: projectLease.service.snapshot().project.rootComposition,
        lockedTracks: new Set(),
      };
      const packages = createNleStudioPackageBridge(projectContext.packages);
      packages.componentDefinitions.assertProject(projectLease.service.snapshot().project);
      const surface = openNleEditingSurface(projectLease.service, {
        context: editing,
        authoring: packages.authoring,
        componentDefinitions: packages.componentDefinitions,
        inspectorPresentations: packages.inspectorPresentations,
      });
      surface.observe({ kind: "open" });
      return new NleStudioProductSession({
        project: options.project,
        context: projectContext,
        projectDocument: projectLease.path,
        projectLease,
        editing,
        surface,
        packages,
        frameExecutor: options.frameExecutor,
        playbackExecutor: options.playbackExecutor,
        mediaTools: options.mediaTools,
        mediaImport: options.mediaImport,
        assertMediaUnused: options.assertMediaUnused,
        delivery: options.delivery,
      });
    } catch (error) {
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

  async #projectMedia(observed?: ProjectMediaCatalog): Promise<NleStudioMediaProjection> {
    const catalog = observed ?? await this.#project.media.observe();
    this.#assertOpen();
    const { editRate } = this.#projectLease.service.snapshot().project;
    if (catalog.generation !== this.#mediaGeneration) {
      this.#clearMediaResources();
      this.#mediaGeneration = catalog.generation;
    }
    return {
      generation: catalog.generation,
      derivedViews: this.#mediaViews !== undefined,
      removeAssets: this.#assertMediaUnused !== undefined,
      entries: await Promise.all(catalog.entries.map(async (entry) => {
        const name = (entry.state === "invalid" ? undefined : entry.displayName) ?? mediaName(entry.reference.path);
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
        const media = {
          id: entry.reference.path, name, kind, mediaType: entry.mediaType, adoptedAt: entry.adoptedAt,
          ...(entry.fileExtension === undefined ? {} : { fileExtension: entry.fileExtension }),
          ...(entry.picture === undefined ? {} : { pictureKind: entry.picture.kind }),
          ...(entry.picture?.version === undefined ? {} : { pictureVersion: entry.picture.version }),
          ...(entry.audioVersion === undefined ? {} : { audioVersion: entry.audioVersion }),
          ...(entry.duration === undefined ? {} : { duration: entry.duration }),
          ...(durationFrames === undefined ? {} : { durationFrames }),
        };
        if (entry.state === "missing") {
          return { ...media, state: "missing" as const,
            ...(entry.diagnostic === undefined ? {} : { diagnostic: entry.diagnostic }) };
        }
        try {
          const resource = await this.#openMediaResource(entry.reference.path);
          return { ...media, state: "available" as const,
            resource: `api/resources/${encodeURIComponent(resource.token)}` };
        } catch (error) {
          return { ...media, state: "missing" as const,
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
    const renderedPreview = this.#renderedPreviews?.resource(token);
    if (renderedPreview !== undefined) return renderedPreview;
    const renderedAudio = this.#renderedAudio?.resource(token);
    if (renderedAudio !== undefined) return renderedAudio;
    const mediaView = this.#mediaViews?.resource(token);
    if (mediaView !== undefined) return mediaView;
    if (this.#deliveryHandles.has(token)) {
      const delivery = this.#delivery!.observe(token);
      if (delivery.state === "complete") return delivery.result;
    }
    throw new Error(`NLE Studio resource ${token} is unavailable in this Session.`);
  }

  #catalog(): NleStudioCatalogProjection {
    const { numerator, denominator } = this.#projectLease.service.snapshot().project.editRate;
    const durationFrames = (duration: ExactTemporalValue) => {
      const time = exactTemporalRational(duration);
      return Math.max(1, Math.round(Number(time.numerator * BigInt(numerator)) / Number(time.denominator * BigInt(denominator))));
    };
    return {
      components: this.#packages.components.map((entry) => ({
        package: entry.package,
        offering: entry.id,
        title: entry.title,
        role: entry.role,
        durationFrames: durationFrames(entry.value.duration),
      })),
      adjusts: this.#packages.adjusts.map((entry) => ({
        package: entry.package,
        offering: entry.id,
        title: entry.title,
        medium: entry.value.medium,
        role: entry.value.role,
        durationFrames: durationFrames(entry.value.duration),
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

  #timeline(catalog: ProjectMediaCatalog): NleStudioTimelineProjection {
    this.#assertOpen();
    const { project, revision } = this.#projectLease.service.snapshot();
    const composition = project.compositions.find((value) => value.id === this.#editing.activeComposition)!;
    const entries = new Map(catalog.entries.map(entry => [entry.reference.path, entry] as const));
    const itemMedia = composition.tracks.flatMap(track => track.items.flatMap(item =>
      item.kind === "present" && item.source === "media"
        ? [{ item: item.id, media: this.#mediaIdentity(item.asset.path, item.id) }]
        : []));
    const observations = itemMedia.flatMap(({ item, media }) => {
      const entry = entries.get(media);
      return entry === undefined || entry.state === "invalid" || entry.displayName === undefined
        ? [] : [{ item, title: entry.displayName }];
    });
    const observation = this.#surface.observe({ kind: "timeline", observations });
    if (observation.kind !== "timeline") throw new Error("NLE Studio received an invalid Timeline projection.");
    const tracksById = new Map(composition.tracks.map(track => [track.id, track]));
    const visit = this.#navigation.at(-1);
    const ranges: [string, NleStudioTimelineProjection["trimRanges"][string]][] = [];
    for (const track of observation.value.tracks) for (const scene of track.items) {
      if (!scene.affordances.trimStart && !scene.affordances.trimEnd) continue;
      const subjectTrack = tracksById.get(track.id)!;
      const item = subjectTrack.items.find(value => value.id === scene.id)!;
      const source = this.#trimSource(project, item, entries);
      const rate = observation.value.editRate;
      const start = scene.affordances.trimStart ? projectTrimRange(project, composition, item, "start", rate, source) : undefined;
      const end = scene.affordances.trimEnd ? projectTrimRange(project, composition, item, "end", rate, source) : undefined;
      ranges.push([item.id, { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) }]);
    }
    return {
      scene: observation.value,
      previewSources: timelinePreviewSources(project, composition, catalog, (path, item) => this.#mediaIdentity(path, item),
        { media: this.#mediaViews !== undefined, renderedPicture: this.#renderedPreviews !== undefined,
          renderedAudio: this.#renderedAudio !== undefined, revision }),
      trimRanges: Object.fromEntries(ranges),
      canReturn: visit?.child === composition.id && project.compositions.some(entry => entry.id === visit.parent),
      compositions: projectCompositionTabs(project, composition.id),
      retimeRates: Object.fromEntries(composition.tracks.flatMap(track => this.#editing.lockedTracks.has(track.id) ? []
        : track.items.flatMap(item => {
          const rate = nleRetimeWindow(item)?.rate;
          return rate === undefined || rate.numerator === 0 ? [] : [[item.id, rate]];
        }))),
      itemMedia,
    };
  }

  #trimSource(project: NleProject, item: NleItem,
    entries: ReadonlyMap<string, ProjectMediaCatalogEntry>): NleSourceTimeBounds | undefined {
    if (item.kind === "adjust") return undefined;
    if (item.source === "component") {
      return this.#packages.componentDefinitions.sourceTime(item);
    }
    if (item.source === "composition") {
      return { kind: "timed", duration: nleCompositionDuration(project.compositions.find(value => value.id === item.composition)!) };
    }
    const entry = entries.get(this.#mediaIdentity(item.asset.path, item.id));
    if (entry?.state !== "available") return undefined;
    return entry.duration === undefined ? { kind: "constant" } : { kind: "timed", duration: entry.duration };
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
    const located = indexNleProject(project).item(id);
    if (located === undefined || located.composition.id !== this.#editing.activeComposition
      || located.item.kind !== "present" || located.item.source !== "component") {
      return { item: id, editable: false, inputs: [] };
    }
    const { item, track, composition } = located;
    return {
      item: id,
      editable: !this.#editing.lockedTracks.has(track.id),
      inputs: this.#packages.authoring.componentMediaInputs({ project, item, track, composition }).map(input => {
        const reference = item.media?.[input.slot];
        return { ...input, ...(reference === undefined ? {} : { media: this.#mediaIdentity(reference.path, item.id) }) };
      }),
    };
  }

  #clipboardProjection(): NleStudioClipboardProjection {
    return {
      items: this.#clipboard?.count ?? 0,
      groups: this.#clipboard?.groups.length ?? 0,
    };
  }

  #clipboardChanged(receipt: NleStudioOperationReceipt): NleStudioOperationReceipt {
    this.#emit({ scope: "product", kind: "clipboard.changed", status: receipt.status, invalidated: ["clipboard"] });
    return { ...receipt, invalidated: [...new Set<NleStudioInvalidation>([...receipt.invalidated, "clipboard"])] };
  }

  #updateEditingContext(project: NleProject): void {
    const compositions = new Set(project.compositions.map(composition => composition.id));
    if (!compositions.has(this.#editing.activeComposition)) {
      this.#editing.activeComposition = project.rootComposition;
      this.#navigation = [];
    } else if (this.#navigation.some(visit => !compositions.has(visit.parent) || !compositions.has(visit.child))) {
      this.#navigation = [];
    }
    if (this.#editing.lockedTracks.size === 0) return;
    const tracks = new Set(project.compositions.flatMap(composition => composition.tracks.map(track => track.id)));
    for (const locked of this.#editing.lockedTracks) if (!tracks.has(locked)) this.#editing.lockedTracks.delete(locked);
  }

  #sessionChange(operation: string, invalidated: readonly NleStudioInvalidation[],
    result?: NleStudioOperationReceipt["result"],
  ): NleStudioOperationReceipt {
    const receipt = this.#observationReceipt(operation, invalidated, result);
    this.#emit({ scope: "product", kind: operation, status: receipt.status, invalidated });
    return receipt;
  }

  #canvas() {
    const observation = this.#surface.observe({ kind: "canvas" });
    if (observation.kind !== "canvas") throw new Error("NLE Studio received an invalid Canvas projection.");
    return observation.value;
  }

  #status(surface = this.#surface.status()): NleStudioStatus {
    return { ...surface, savedAt: new Date(nodeNleProjectSavedAt(this.#projectLease.service)).toISOString() };
  }

  async #openProjection(): Promise<NleStudioOpenProjection> {
    const catalog = await this.#project.media.observe();
    const [media, mediaLibrary] = await Promise.all([this.#projectMedia(catalog), this.#mediaLibrary()]);
    return {
      project: this.#projectProjection(),
      status: this.#status(),
      timeline: this.#timeline(catalog),
      canvas: this.#canvas(),
      media,
      mediaLibrary,
      catalog: this.#catalog(),
      preview: this.#previewProjection(),
      delivery: this.#deliveryProjection(),
      clipboard: this.#clipboardProjection(),
    };
  }

  #deliveryProjection(): NleStudioOpenProjection["delivery"] {
    if (this.#delivery === undefined) return { state: "unavailable" };
    const project = this.#projectLease.service.snapshot().project;
    const root = project.compositions.find(composition => composition.id === project.rootComposition)!;
    return { state: "available", width: root.canvas.width, height: root.canvas.height,
      hasItems: nleCompositionDuration(root).ticks !== "0" };
  }

  async #mediaLibrary(): Promise<NleStudioOpenProjection["mediaLibrary"]> {
    try {
      return { state: "available", ...await this.#project.media.observeLibrary() };
    } catch (error) {
      return { state: "invalid", diagnostic: error instanceof Error ? error.message : String(error) };
    }
  }

  #projectProjection(): NleStudioOpenProjection["project"] {
    const { project } = this.#projectLease.service.snapshot();
    const folder = posix.dirname(this.#projectDocument);
    const paths = indexNleProject(project).mediaAssetPaths()
      .map(path => posix.join(folder, path))
      .filter(path => !path.startsWith("../"));
    return { name: project.name, rootComposition: project.rootComposition, document: this.#projectDocument,
      usedMedia: [...new Set(paths)] };
  }

  #previewProjection(): NleStudioPreviewProjection {
    if (this.#preview === undefined || this.programme === undefined) return { state: "unavailable" };
    const { project, revision } = this.#projectLease.service.snapshot();
    const { activeComposition } = this.#editing;
    const { editRate } = project;
    const composition = project.compositions.find(entry => entry.id === activeComposition);
    const key = JSON.stringify([revision, activeComposition, editRate.numerator, editRate.denominator, this.#programmeMediaGeneration]);
    const programme = composition === undefined || nleCompositionDuration(composition).ticks === "0" ? undefined
      : this.programme.select(key, composition.id, project, editRate);
    if (programme === undefined) this.programme.clear();
    return { state: "available", playback: this.#preview.playback, waveform: this.#preview.waveform,
      generation: this.#preview.generation, ...(programme === undefined ? {} : { programme }) };
  }

  async observe(request: NleStudioObservationRequest): Promise<NleStudioObservation> {
    this.#assertOpen();
    switch (request.kind) {
      case "open": return { kind: "open", value: await this.#openProjection() };
      case "project": return { kind: "project", value: this.#projectProjection() };
      case "status": return { kind: "status", value: this.#status() };
      case "timeline": return { kind: "timeline", value: this.#timeline(await this.#project.media.observe()) };
      case "timeline-drop": {
        const project = this.#projectLease.service.snapshot();
        if (project.revision !== request.drop.expectedProjectRevision) {
          throw new NleEditingSurfaceRevisionConflict(request.drop.expectedProjectRevision, project.revision);
        }
        const composition = project.project.compositions.find(value => value.id === request.drop.composition);
        if (composition === undefined || this.#editing.activeComposition !== composition.id) {
          throw new Error(`NLE Studio drop targets inactive Composition ${request.drop.composition}.`);
        }
        const plan = planTimelineDrop({ project: project.project, composition, lockedTracks: this.#editing.lockedTracks }, request.drop);
        if (plan.commands.length > 0) applyNleTransaction(project.project, { commands: plan.commands });
        return { kind: "timeline-drop", value: plan.destination };
      }
      case "canvas": return { kind: "canvas", value: this.#canvas() };
      case "inspector": {
        const observation = this.#surface.observe({ kind: "inspector", item: request.item });
        if (observation.kind !== "inspector") throw new Error("NLE Studio received an invalid Inspector projection.");
        return { kind: "inspector", value: observation.value };
      }
      case "transition-inspector": {
        const observation = this.#surface.observe(request);
        if (observation.kind !== request.kind) throw new Error("NLE Studio received an invalid Transition Inspector projection.");
        return observation;
      }
      case "component-inputs": return { kind: "component-inputs", value: this.#componentInputs(request.item) };
      case "clipboard": return { kind: "clipboard", value: this.#clipboardProjection() };
      case "media": return { kind: "media", value: await this.#projectMedia() };
      case "media-library": return { kind: "media-library", value: await this.#mediaLibrary() };
      case "catalog": return { kind: "catalog", value: this.#catalog() };
      case "preview": return { kind: "preview", value: this.#previewProjection() };
      case "action": return { kind: "action", value: this.observeAction(request.handle) };
      case "delivery": return {
        kind: "delivery",
        value: this.#deliveryProjection(),
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
    if (receipt.projectChanged) { invalidated.add("project"); invalidated.add("delivery"); }
    for (const value of receipt.invalidated) {
      if (value === "programme") invalidated.add("preview");
      else invalidated.add(value);
    }
    return {
      operation,
      status: this.#status(receipt.status),
      projectChanged: receipt.projectChanged,
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
      status: this.#status(),
      projectChanged: false,
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
    return this.#observationReceipt("media.import", ["media", "media-library"], { media: adopted.reference.path });
  }

  async editMediaLibrary(request: ProjectMediaLibraryEdit): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    await this.#project.media.editLibrary(request);
    return this.#observationReceipt(request.kind, ["media-library"]);
  }

  async editMediaAsset(request: ProjectMediaAssetEdit): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    await this.#project.media.editAsset(request, async asset => {
      if (this.#assertMediaUnused === undefined) throw new Error("素材删除需要项目引用检查。");
      await this.#assertMediaUnused(this.#project, asset);
    });
    return this.#observationReceipt(request.kind, request.kind === "asset.remove" ? ["media", "media-library"] : ["media", "timeline"]);
  }

  async command(command: NleEditingSurfaceCommand): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    return this.#receipt(command.kind, this.#surface.command(command));
  }

  async operate(operation: NleStudioOperation): Promise<NleStudioOperationReceipt> {
    this.#assertOpen();
    const projectSnapshot = this.#projectLease.service.snapshot();
    if (projectSnapshot.revision !== operation.expectedProjectRevision) {
      throw new NleEditingSurfaceRevisionConflict(operation.expectedProjectRevision, projectSnapshot.revision);
    }
    const { project } = projectSnapshot;
    const composition = project.compositions.find(entry => entry.id === operation.composition);
    if (composition === undefined || this.#editing.activeComposition !== composition.id) {
      throw new Error(`NLE Studio Operation targets inactive Composition ${operation.composition}.`);
    }
    const commit = (commands: readonly NleCommand[], result: NleStudioOperationReceipt["result"]) => {
      this.#assertOpen();
      if (this.#editing.activeComposition !== composition.id) throw new Error(`NLE Studio Operation targets inactive Composition ${composition.id}.`);
      if (commands.length === 0) return this.#observationReceipt(operation.kind, [], result);
      return this.#receipt(operation.kind, this.#surface.command({
        kind: "project.transact",
        expectedProjectRevision: projectSnapshot.revision,
        commands,
      }), result);
    };
    const frameTime = (value: number) => studioFrameTime(value, project.editRate);
    const durationOverride = "durationFrames" in operation ? operation.durationFrames : undefined;
    if (durationOverride !== undefined && (!Number.isSafeInteger(durationOverride) || durationOverride <= 0)) {
      throw new Error("NLE Studio occurrence duration must be a positive safe integer.");
    }
    if ("atFrame" in operation && (!Number.isSafeInteger(operation.atFrame) || operation.atFrame < 0)) {
      throw new Error("NLE Studio placement frame must be a non-negative safe integer.");
    }
    const duration = durationOverride === undefined ? undefined : frameTime(durationOverride);
    const lockedTracks = this.#editing.lockedTracks;
    const context = { project, composition, lockedTracks };
    const currentItems = () => composition.tracks.flatMap(track => track.items);
    const identity = (role: string) => `${role}-${randomUUID()}`;
    const placePresent = (
      input: { readonly track?: string; readonly insertTracks?: readonly string[] },
      medium: NleTrack["kind"],
      start: ExactTemporalValue,
      length: ExactTemporalValue,
      role: NleTrack["role"] = medium,
    ) => {
      const purpose = { kind: "present", start, duration: length } as const;
      const placement = allocateTimelinePlacement(context, { medium, role, track: input.track, purpose });
      if (input.insertTracks === undefined) return placement;
      if (input.track === undefined) throw new Error("NLE Studio insertion requires a destination Track.");
      const commands = planTimelineInsertion(context, input.track, input.insertTracks, start, length);
      return { ...placement, commands };
    };
    const navigate = (target: string, frame: number, next: readonly NestedVisit[]) => {
      if (!project.compositions.some(entry => entry.id === target)) throw new Error(`Unknown NLE Composition ${target}.`);
      this.#editing.activeComposition = target;
      this.#navigation = next;
      this.#preview?.invalidate();
      return this.#sessionChange(operation.kind, ["timeline", "canvas", "inspector", "media", "preview"],
        { composition: target, frame });
    };

    switch (operation.kind) {
      case "track-lock.set": {
        if (!composition.tracks.some(track => track.id === operation.track)) {
          throw new Error(`Unknown NLE Track ${operation.track} in Composition ${composition.id}.`);
        }
        if (lockedTracks.has(operation.track) === operation.locked) return this.#observationReceipt(operation.kind, []);
        if (operation.locked) lockedTracks.add(operation.track);
        else lockedTracks.delete(operation.track);
        return this.#sessionChange(operation.kind, ["timeline", "canvas", "inspector"]);
      }
      case "timeline.drop": {
        const plan = planTimelineDrop(context, operation);
        return commit(plan.commands, { track: plan.anchorTrack });
      }
      case "timeline.track-reorder":
        return commit(planTimelineTrackReorder(composition, lockedTracks, operation.track, operation.before), { track: operation.track });
      case "timeline.trim":
      case "timeline.slip":
      case "timeline.retime":
      case "timeline.roll":
      case "timeline.ripple-trim":
      case "timeline.split":
      case "timeline.remove":
      case "timeline.ripple-remove":
      case "timeline.close-gap": {
        const plan = planTimelineEdit(context, operation);
        const trims = plan.commands.flatMap(command => command.kind === "item.roll" ? [
          { id: command.left, edge: "end" as const, at: command.at },
          { id: command.right, edge: "start" as const, at: command.at },
        ] : command.kind === "item.trim" || command.kind === "item.ripple-trim" ? [command] : []);
        if (trims.length > 0) {
          const catalog = await this.#project.media.observe();
          const entries = new Map(catalog.entries.map(entry => [entry.reference.path, entry] as const));
          const index = indexNleProject(project);
          const preparation = trims.flatMap(({ id, edge, at }) => {
            const { item } = index.item(id)!;
            const prepare = planTrimEdge(item, edge, at, project.editRate, this.#trimSource(project, item, entries));
            return prepare === undefined ? [] : [prepare];
          });
          return commit([...preparation, ...plan.commands], { count: plan.count });
        }
        if (plan.commands.length > 0 && (operation.kind === "timeline.slip" || operation.kind === "timeline.retime")) {
          const planned = applyNleTransaction(project, { commands: plan.commands });
          const item = indexNleProject(planned).item(operation.item)!.item;
          if (item.kind === "present" && item.source === "media") {
            const { interpretation } = await this.#resolveMediaBinding(this.#mediaIdentity(item.asset.path, item.id));
            if (interpretation.domain === undefined) {
              throw new Error(`NLE Item ${item.id} requires timed Media for ${operation.kind}.`);
            }
            assertTemporalMapPieces(item.sourceTime.pieces,
              sealLocalTemporalDomain({ id: `${item.id}:time`, duration: item.duration }), interpretation.domain);
          }
        }
        return commit(plan.commands, { count: plan.count });
      }
      case "clipboard.copy":
      case "clipboard.cut": {
        const clipboard = captureStudioClipboard(composition, operation.items);
        const commands = operation.kind === "clipboard.cut"
          ? planTimelineEdit(context, { ...operation, kind: "timeline.remove" }).commands
          : [];
        const receipt = commit(commands, { count: clipboard.count });
        this.#clipboard = clipboard;
        return this.#clipboardChanged(receipt);
      }
      case "clipboard.paste": {
        if (this.#clipboard === undefined) throw new Error("NLE Studio clipboard is empty.");
        const plan = planStudioPaste(this.#clipboard, composition, lockedTracks, frameTime(operation.atFrame));
        return commit(plan.commands, { item: plan.items[0]!, count: plan.items.length });
      }
      case "media.materialize": {
        const { asset, interpretation } = await this.#resolveMediaBinding(operation.media);
        const at = frameTime(operation.atFrame);
        const length = duration ?? interpretation.domain?.duration
          ?? frameTime(Math.max(1, Math.round(5 * project.editRate.numerator / project.editRate.denominator)));
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
      case "media.freeze": {
        const item = currentItems().find(entry => entry.id === operation.item);
        if (item?.kind !== "present" || item.source !== "media" || item.picture === undefined
            || item.picture.processes?.some(process => process.enabled)) {
          throw new Error("NLE Studio freeze requires a Media Picture Present without enabled Picture Processes.");
        }
        const at = frameTime(operation.sampleFrame);
        if (compareExactTemporalValues(at, item.start) < 0 || compareExactTemporalValues(at, nleItemEnd(item)) >= 0) {
          throw new Error(`NLE Studio sample frame is outside Item ${item.id}.`);
        }
        const { interpretation } = await this.#resolveMediaBinding(this.#mediaIdentity(item.asset.path, item.id));
        if (interpretation.domain === undefined || interpretation.picture?.kind !== "signal") {
          throw new Error(`NLE Item ${item.id} requires a sampled Media Picture for freeze.`);
        }
        const sample = evaluateTemporalMap({ stages: [{
          target: sealLocalTemporalDomain({ id: `${item.id}:time`, duration: item.duration }),
          source: interpretation.domain,
          pieces: item.sourceTime.pieces,
        }] }, subtractExactTemporalValues(at, item.start), "after");
        if (sample?.sourceSide !== "after" || evaluateTemporalMap(interpretation.picture.map, sample.position, "after") === undefined) {
          throw new Error(`NLE Item ${item.id} sample frame must select a forward Picture sample.`);
        }
        const start = frameTime(operation.atFrame);
        const length = duration!;
        const placement = placePresent(operation, "picture", start, length);
        const id = identity("freeze");
        return commit([...placement.commands, {
          kind: "item.add", track: placement.track, item: {
            id, kind: "present", source: "media", asset: item.asset, start, duration: length, enabled: true,
            picture: item.picture, sourceTime: nleLinearTimeMapping(length, sample.position, { numerator: 0, denominator: 1 }),
          },
        }], { item: id, track: placement.track });
      }
      case "component.materialize": {
        const offering = this.#packages.component(operation.package, operation.offering);
        if (offering === undefined) {
          throw new Error(`NLE Studio Component offering ${operation.package}#${operation.offering} is not selected.`);
        }
        const at = frameTime(operation.atFrame);
        const length = duration ?? offering.value.duration;
        const placement = placePresent(operation, "picture", at, length, offering.role);
        const item = identity("component");
        const valueBindings = Object.entries(offering.value.values ?? {}).map(([slot, value]) =>
          ({ slot, kind: "inline" as const, value }));
        const creation = {
          id: item, name: offering.title, track: placement.track,
          component: offering.value.component, parameters: offering.value.parameters,
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
          medium: offering.value.medium, role: offering.value.role, track: operation.track, purpose: { kind: "adjust" },
        });
        const item = identity("adjust");
        const materialization = createAdjustMaterialization(placement.project, {
          id: item, name: offering.title, track: placement.track, operator: offering.value.operator,
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
      case "process.timing":
      case "process.remove": {
        const item = currentItems().find(entry => entry.id === operation.item);
        const process = item?.kind === "present" ? item[operation.medium]?.processes?.find(entry => entry.id === operation.process)
          : undefined;
        if (item === undefined || process === undefined) {
          throw new Error(`NLE Item ${operation.item} has no ${operation.medium} Process ${operation.process}.`);
        }
        const address = { item: operation.item, medium: operation.medium };
        const result = { item: operation.item, process: operation.process };
        if (operation.kind === "process.enable") {
          return commit(process.enabled === operation.enabled ? [] : [{
            kind: "process.replace", ...address, process: { ...process, enabled: operation.enabled },
          }], result);
        }
        if (operation.kind === "process.timing") {
          const timing = process.controlTime;
          if (operation.edge === "mapping") {
            if ("pieces" in timing) return commit([], result);
            return commit([{ kind: "process.retime", ...address, id: process.id,
              controlTime: { ...resolveNleProcessTime(timing, item.duration), controlDuration: timing.controlDuration },
            }], result);
          }
          const controlDuration = nleProcessControlDuration(timing);
          return commit([{ kind: "process.retime", ...address, id: process.id, controlTime: {
            edge: operation.edge, controlDuration,
            duration: duration ?? ("edge" in timing ? timing.duration : controlDuration),
          } }], result);
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
        const items = "items" in operation ? currentItems().filter(item => operation.items.includes(item.id))
          .sort((left, right) => compareExactTemporalValues(left.start, right.start))
          : resolveTransitionCut(composition, operation.track, frameTime(operation.atFrame));
        if (items.length !== 2) throw new Error("NLE Studio Transition requires two Items in the active Composition.");
        assertTransitionMove(composition, items[1]!.id);
        const transition = identity("transition");
        const materialization = createTransitionMaterialization(project, {
          id: transition, composition: composition.id, outgoing: items[0]!.id, incoming: items[1]!.id,
          operator: offering.value.operator, parameters: offering.value.parameters,
          duration: duration ?? offering.value.duration,
        });
        return commit(materialization.commands, { transition });
      }
      case "transition.replace":
      case "transition.resize":
      case "transition.remove": {
        const transition = composition.transitions.find(value => value.id === operation.transition);
        if (transition === undefined) throw new Error(`Unknown NLE Transition ${operation.transition} in ${composition.id}.`);
        const result = { transition: transition.id };
        if (operation.kind === "transition.remove") return commit([{ kind: "transition.remove", id: transition.id }], result);
        const timeCommands = duration === undefined ? [] : planTransitionWindow(context, transition, duration);
        if (operation.kind === "transition.resize") return commit(timeCommands, result);
        const offering = this.#packages.transition(operation.package, operation.offering);
        if (offering === undefined) {
          throw new Error(`NLE Studio Transition offering ${operation.package}#${operation.offering} is not selected.`);
        }
        return commit([...timeCommands, {
          kind: "transition.replace", transition: {
            ...transition, operator: offering.value.operator, parameters: offering.value.parameters,
          },
        }], result);
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
      case "composition.duplicate": {
        const plan = planCopyComposition(project, operation.source);
        return commit(plan.commands, { composition: plan.composition });
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
          ...previous, { parent: composition.id, child: item.composition, at: frameTime(operation.atFrame) },
        ]);
      }
      case "composition.return": {
        const visit = this.#navigation.at(-1);
        if (visit?.child !== composition.id) throw new Error(`NLE Studio has no parent visit for ${composition.id}.`);
        const { numerator, denominator } = exactTemporalRational(visit.at);
        const frame = Math.round(Number(numerator) / Number(denominator)
          * project.editRate.numerator / project.editRate.denominator);
        return navigate(visit.parent, frame, this.#navigation.slice(0, -1));
      }
      case "audio.detach": {
        const plan = planAudioDetachment(context, operation.item, operation.track);
        return commit(plan.commands, { item: plan.item, track: plan.track });
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
      return mediaActionObservation(await this.#mediaViews.start(request));
    }
    if (request.kind === "audio.source-preview") {
      const previews = this.#renderedAudio;
      if (previews === undefined) throw new Error("NLE Studio rendered Audio previews are unavailable.");
      const readSource = async () => {
        const catalog = await this.#project.media.observe();
        this.#assertOpen();
        const { project, revision } = this.#projectLease.service.snapshot();
        if (!project.compositions.some(value => value.id === request.target.composition)) {
          throw new Error(`NLE Studio has no Composition ${request.target.composition}.`);
        }
        if (renderedPreviewVersion(revision, catalog.generation, request.target) !== request.version) {
          throw new Error("The Audio source changed before preview sampling.");
        }
        return project;
      };
      const project = await readSource();
      return previews.start(request, project, async () => { await readSource(); });
    }
    if (request.kind === "picture.source-preview") {
      const previews = this.#renderedPreviews;
      if (previews === undefined) throw new Error("NLE Studio rendered Picture previews are unavailable.");
      const { target } = request;
      const readSource = async () => {
        const catalog = await this.#project.media.observe();
        this.#assertOpen();
        const { project, revision } = this.#projectLease.service.snapshot();
        const composition = project.compositions.find(value => value.id === target.composition);
        if (composition === undefined) throw new Error(`NLE Studio has no Composition ${target.composition}.`);
        if (renderedPreviewVersion(revision, catalog.generation, target) !== request.version) {
          throw new Error("The Picture source changed before preview sampling.");
        }
        if (target.kind === "composition") return { project, subject: { composition } };
        const item = composition.tracks.flatMap(track => track.items).find(value => value.id === target.item);
        if (item?.kind !== "present" || item.source !== "component" || item.picture === undefined) {
          throw new Error(`NLE Composition ${composition.id} has no Picture Component ${target.item}.`);
        }
        return { project, subject: { composition, item } };
      };
      const { project, subject } = await readSource();
      return previews.start(request, project, subject, async () => { await readSource(); });
    }
    const snapshot = this.#projectLease.service.snapshot();
    if (snapshot.revision !== request.expectedProjectRevision) {
      throw new NleEditingSurfaceRevisionConflict(request.expectedProjectRevision, snapshot.revision);
    }
    if (request.kind !== "delivery") {
      if (request.composition !== this.#editing.activeComposition) {
        throw new Error(`NLE Studio preview targets inactive Composition ${request.composition}.`);
      }
      if (this.#preview === undefined) throw new Error("NLE Studio preview is unavailable.");
      return this.#preview.start(request, snapshot.project, snapshot.project.editRate);
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
    const preview = this.#preview?.observe(handle);
    if (preview !== undefined) return preview;
    const renderedPreview = this.#renderedPreviews?.observe(handle);
    if (renderedPreview !== undefined) return renderedPreview;
    const renderedAudio = this.#renderedAudio?.observe(handle);
    if (renderedAudio !== undefined) return renderedAudio;
    const media = this.#mediaViews?.observe(handle);
    if (media !== undefined) return mediaActionObservation(media);
    throw new Error(`NLE Studio Action ${handle} is unavailable in this Session.`);
  }

  cancelAction(handle: string): NleStudioActionObservation {
    this.#assertOpen();
    if (this.#deliveryHandles.has(handle)) return this.#deliveryObservation(this.#delivery!.cancel(handle));
    const preview = this.#preview?.cancel(handle);
    if (preview !== undefined) return preview;
    const renderedPreview = this.#renderedPreviews?.cancel(handle);
    if (renderedPreview !== undefined) return renderedPreview;
    const renderedAudio = this.#renderedAudio?.cancel(handle);
    if (renderedAudio !== undefined) return renderedAudio;
    const media = this.#mediaViews?.cancel(handle);
    if (media !== undefined) return mediaActionObservation(media);
    throw new Error(`NLE Studio Action ${handle} is unavailable in this Session.`);
  }

  #withProjectFile<Result>(operation: () => Promise<Result>): Promise<Result> {
    const service = this.#projectLease.service;
    const prior = projectFileOperations.get(service) ?? Promise.resolve();
    const next = prior.then(() => { this.#assertOpen(); return operation(); });
    projectFileOperations.set(service, next.then(() => undefined, () => undefined));
    return next;
  }

  save(): Promise<NleStudioOperationReceipt> {
    return this.#withProjectFile(async () => {
      if (this.#projectLease.service.snapshot().dirty) {
        await nleProjectOwnerProvider.save(this.#context, this.#projectDocument, this.#projectLease.service);
      }
      return this.#observationReceipt("document.save", []);
    });
  }

  reload(): Promise<NleStudioOperationReceipt> {
    return this.#withProjectFile(async () => {
      await nleProjectOwnerProvider.reload(this.#context, this.#projectDocument, this.#projectLease.service);
      return {
        operation: "document.reload",
        status: this.#status(),
        projectChanged: true,
        invalidated: ["project", "timeline", "canvas", "inspector", "media", "preview"],
      };
    });
  }

  retainWhenDisconnected(): boolean {
    return this.#deliverySubscriptions.size > 0 || this.#projectLease.service.snapshot().dirty;
  }

  async close(): Promise<void> {
    if (this.closed.aborted) return;
    this.#lifetime.abort();
    this.#clipboard = undefined;
    this.#navigation = [];
    this.#unsubscribeSurface();
    this.#unsubscribeMedia();
    for (const unsubscribe of this.#deliverySubscriptions.values()) unsubscribe();
    this.#deliverySubscriptions.clear();
    this.#deliveryHandles.clear();
    this.#listeners.clear();
    this.#surface.close();
    this.#delivery?.close();
    try {
      await Promise.all([this.#preview?.close(), this.#renderedPreviews?.close(), this.#renderedAudio?.close(),
        this.programme?.close(), this.#mediaViews?.close()]);
    }
    finally {
      this.#clearMediaResources();
      this.#projectLease.close();
    }
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
  if (Object.keys(selected).some(key => key !== "document")) {
    throw new Error("NLE Studio Product input fields are invalid.");
  }
  if (typeof selected.document !== "string" || selected.document.length === 0) {
    throw new Error("NLE Studio Product input requires a document path.");
  }
  return { document: selected.document };
}

export type NleStudioProductProviderOptions = {
  readonly frameExecutor?: HtmlFrameExecutor;
  readonly deliveryExecutor?: HtmlVideoExecutor;
  readonly mediaTools?: LocalMediaToolchainOptions;
  readonly assertMediaUnused?: AssertMediaUnused;
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
    ],
    async open(project, value) {
      const selected = productInput(value);
      const media = project.media as Partial<NodeProjectMediaService>;
      const mediaImport: NleStudioMediaImportPort | undefined = typeof media.adoptFile !== "function" ? undefined : {
        async adopt(request) {
          const mediaType = mediaTypeFromFile(request.sourceName);
          const result = await media.adoptFile!({ ...request, mediaType }, {
            inspect: (path, context) => inspectMediaFileForAdoption(path, mediaType, {
              ...(options.mediaTools?.ffprobePath === undefined ? {} : { ffprobePath: options.mediaTools.ffprobePath }),
              ...(context.signal === undefined ? {} : { signal: context.signal }),
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
          ...(options.frameExecutor === undefined ? {} : { frameExecutor: options.frameExecutor }),
          ...(options.deliveryExecutor === undefined ? {} : { playbackExecutor: options.deliveryExecutor }),
          mediaTools: options.mediaTools ?? {},
          ...(mediaImport === undefined ? {} : { mediaImport }),
          ...(options.assertMediaUnused === undefined ? {} : { assertMediaUnused: options.assertMediaUnused }),
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
  createNleStudioPackageBridge,
  nleStudioAdjustOfferingKind,
  nleStudioComponentOfferingKind,
  nleStudioProcessOfferingKind,
  nleStudioTransitionOfferingKind,
  type NleStudioAdjustOffering,
  type NleStudioAdjustOfferingValue,
  type NleStudioComponentOffering,
  type NleStudioComponentOfferingValue,
  type NleStudioPackageBridge,
  type NleStudioProcessOffering,
  type NleStudioProcessOfferingValue,
  type NleStudioTransitionOffering,
  type NleStudioTransitionOfferingValue,
} from "./packages.js";

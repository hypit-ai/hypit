import { planNleSpatialEdit } from "../spatial-authoring.js";
import { planNleComponentValueEdit } from "../component-value-authoring.js";
import { type NleProjectService } from "../service.js";
import type { NleProject } from "../types.js";
import {
  allNleCanvasAffordances,
  allNleTimelineAffordances,
  assertNleSpatialEditAllowed,
  assertNleViewAllowsProjectTransaction,
  assertNleViewForProject,
  createNleInspectorPresentationHost,
  mergeNleTimelineItemObservations,
  projectNleCanvas,
  projectNleTimeline,
  reconcileNleView,
  resolveNleSpatialItemCapabilities,
  resolveNleTimelineItemCapabilities,
  type NleAuthoringHost,
  type NleCanvasAffordancePolicy,
  type NleInspectorPresentationContribution,
  type NleTimelineAffordancePolicy,
  type NleTimelineItemObservation,
  type NleTimelinePresentationHost,
  type NleView,
  type NleViewService,
} from "../view/index.js";
import type {
  NleEditingSurfaceChange,
  NleEditingSurfaceCommand,
  NleEditingSurfaceInvalidation,
  NleEditingSurfaceListener,
  NleEditingSurfaceObservation,
  NleEditingSurfaceObservationRequest,
  NleEditingSurfaceOpen,
  NleEditingSurfaceReceipt,
  NleEditingSurfaceStatus,
} from "./types.js";

export class NleEditingSurfaceRevisionConflict extends Error {
  constructor(
    readonly owner: "project" | "view",
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`NLE Editing Surface ${owner} changed: expected revision ${expected}, found ${actual}.`);
    this.name = "NleEditingSurfaceRevisionConflict";
  }
}

export type NleEditingSurfaceOptions = {
  readonly authoring?: NleAuthoringHost;
  readonly timelinePresentation?: NleTimelinePresentationHost;
  readonly inspectorPresentations?: readonly NleInspectorPresentationContribution[];
  readonly timelinePolicy?: NleTimelineAffordancePolicy;
  readonly canvasPolicy?: NleCanvasAffordancePolicy;
  /** Maps a process-local presentation resource id into one adapter-owned address. */
  readonly presentationResourceUrl?: (resource: string) => string;
};

/**
 * Application composition over one Project Service and one View Service.
 * It owns no author facts, persistence, transport or audiovisual Action lifecycle.
 */
export class NleEditingSurface {
  readonly #projectService: NleProjectService;
  readonly #viewService: NleViewService;
  readonly #options: NleEditingSurfaceOptions;
  readonly #inspector: ReturnType<typeof createNleInspectorPresentationHost>;
  readonly #listeners = new Set<NleEditingSurfaceListener>();
  readonly #unsubscribeProject: () => void;
  readonly #unsubscribeView: () => void;
  #closed = false;

  constructor(
    projectService: NleProjectService,
    viewService: NleViewService,
    options: NleEditingSurfaceOptions = {},
  ) {
    this.#projectService = projectService;
    this.#viewService = viewService;
    this.#options = options;
    this.#inspector = createNleInspectorPresentationHost(
      options.inspectorPresentations ?? [], options.authoring,
    );
    this.#unsubscribeProject = projectService.subscribe((change) => {
      this.#emit({ owner: "project", kind: change.kind, status: this.status() });
    });
    this.#unsubscribeView = viewService.subscribe((change) => {
      this.#emit({ owner: "view", kind: change.kind, status: this.status() });
    });
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("NLE Editing Surface is closed.");
  }

  #emit(change: NleEditingSurfaceChange): void {
    for (const listener of this.#listeners) {
      try {
        listener(structuredClone(change));
      } catch {
        // Observation cannot veto an accepted owner mutation.
      }
    }
  }

  #requireProjectRevision(expected: number): void {
    const actual = this.#projectService.snapshot().revision;
    if (expected !== actual) throw new NleEditingSurfaceRevisionConflict("project", expected, actual);
  }

  #requireViewRevision(expected: number): void {
    const actual = this.#viewService.snapshot().revision;
    if (expected !== actual) throw new NleEditingSurfaceRevisionConflict("view", expected, actual);
  }

  #requireRevisions(expectedProject: number, expectedView: number): void {
    this.#requireProjectRevision(expectedProject);
    this.#requireViewRevision(expectedView);
  }

  status(): NleEditingSurfaceStatus {
    this.#assertOpen();
    const project = this.#projectService.snapshot();
    const view = this.#viewService.snapshot();
    let viewCompatibility: NleEditingSurfaceStatus["viewCompatibility"] = "compatible";
    try {
      assertNleViewForProject(view.view, project.project);
    } catch {
      viewCompatibility = "stale";
    }
    return {
      projectRevision: project.revision,
      viewRevision: view.revision,
      projectDirty: project.dirty,
      viewDirty: view.dirty,
      projectHistory: { canUndo: project.canUndo, canRedo: project.canRedo },
      viewHistory: { canUndo: view.canUndo, canRedo: view.canRedo },
      viewCompatibility,
    };
  }

  subscribe(listener: NleEditingSurfaceListener): () => void {
    this.#assertOpen();
    if (typeof listener !== "function") throw new Error("NLE Editing Surface listener must be a function.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #observations(
    project: NleProject, view: NleView, extra: readonly NleTimelineItemObservation[],
  ): readonly NleTimelineItemObservation[] {
    const packaged = this.#options.timelinePresentation?.observations(
      project, view.activeComposition, this.#options.presentationResourceUrl,
    ) ?? [];
    return mergeNleTimelineItemObservations([...packaged, ...extra]);
  }

  #projectionView(project: NleProject, view: NleView): NleView {
    try {
      assertNleViewForProject(view, project);
      return view;
    } catch {
      return reconcileNleView(view, project);
    }
  }

  #open(observations: readonly NleTimelineItemObservation[]): NleEditingSurfaceOpen {
    const project = this.#projectService.snapshot();
    const view = this.#viewService.snapshot();
    const projectionView = this.#projectionView(project.project, view.view);
    const merged = this.#observations(project.project, projectionView, observations);
    const timelineCapabilities = resolveNleTimelineItemCapabilities(
      project.project, projectionView, this.#options.authoring,
    );
    const spatialCapabilities = resolveNleSpatialItemCapabilities(project.project, projectionView);
    return {
      status: this.status(),
      project,
      view,
      timelineCapabilities,
      spatialCapabilities,
      timeline: projectNleTimeline(
        project.project,
        projectionView,
        merged,
        timelineCapabilities,
        this.#options.timelinePolicy ?? allNleTimelineAffordances,
      ),
      canvas: projectNleCanvas(
        project.project,
        projectionView,
        merged,
        spatialCapabilities,
        this.#options.canvasPolicy ?? allNleCanvasAffordances,
      ),
    };
  }

  observe(request: NleEditingSurfaceObservationRequest): NleEditingSurfaceObservation {
    this.#assertOpen();
    if (request.kind === "status") return { kind: "status", value: this.status() };
    const extra = "observations" in request ? request.observations ?? [] : [];
    if (request.kind === "open") return { kind: "open", value: this.#open(extra) };
    const project = this.#projectService.snapshot().project;
    const view = this.#projectionView(project, this.#viewService.snapshot().view);
    if (request.kind === "transition-inspector") {
      return { kind: request.kind, value: this.#inspector.transitionScene(project, view, request.transition) };
    }
    const observations = this.#observations(project, view, extra);
    if (request.kind === "timeline") {
      const capabilities = resolveNleTimelineItemCapabilities(project, view, this.#options.authoring);
      return { kind: "timeline", value: projectNleTimeline(
        project, view, observations, capabilities,
        this.#options.timelinePolicy ?? allNleTimelineAffordances,
      ) };
    }
    if (request.kind === "canvas") {
      const capabilities = resolveNleSpatialItemCapabilities(project, view);
      return { kind: "canvas", value: projectNleCanvas(
        project, view, observations, capabilities,
        this.#options.canvasPolicy ?? allNleCanvasAffordances,
      ) };
    }
    return {
      kind: "inspector",
      value: this.#inspector.scene(project, view, request.item, observations),
    };
  }

  #receipt(
    changed: NleEditingSurfaceReceipt["changed"],
    invalidated: readonly NleEditingSurfaceInvalidation[],
  ): NleEditingSurfaceReceipt {
    return { status: this.status(), changed, invalidated };
  }

  command(command: NleEditingSurfaceCommand): NleEditingSurfaceReceipt {
    this.#assertOpen();
    switch (command.kind) {
      case "project.transact": {
        this.#requireRevisions(command.expectedProjectRevision, command.expectedViewRevision);
        const project = this.#projectService.snapshot().project;
        const view = this.#viewService.snapshot().view;
        const transaction = { commands: command.commands };
        assertNleViewAllowsProjectTransaction(
          view,
          project,
          transaction,
          resolveNleTimelineItemCapabilities(project, view, this.#options.authoring),
        );
        this.#projectService.transact({
          expectedRevision: command.expectedProjectRevision,
          commands: command.commands,
        });
        return this.#receipt({ project: true, view: false },
          ["timeline", "canvas", "inspector", "programme"]);
      }
      case "view.transact":
        this.#requireRevisions(command.expectedProjectRevision, command.expectedViewRevision);
        this.#viewService.transact({
          expectedRevision: command.expectedViewRevision,
          commands: command.commands,
        }, this.#projectService.snapshot().project);
        return this.#receipt({ project: false, view: true }, ["timeline", "canvas", "inspector"]);
      case "inspector.edit":
      case "transition-inspector.edit":
      case "inspector.invoke": {
        this.#requireRevisions(command.expectedProjectRevision, command.expectedViewRevision);
        const project = this.#projectService.snapshot().project;
        const view = this.#viewService.snapshot().view;
        const transaction = command.kind === "inspector.edit"
          ? this.#inspector.planEdit(project, view, command.item, command.section, command.field, command.value)
          : command.kind === "inspector.invoke" ? this.#inspector.planRowAction(project, view, command.item, command)
            : this.#inspector.planTransitionEdit(project, view, command.transition, command.section, command.field, command.value);
        assertNleViewAllowsProjectTransaction(view, project, transaction);
        this.#projectService.transact({
          expectedRevision: command.expectedProjectRevision,
          commands: transaction.commands,
        });
        return this.#receipt({ project: true, view: false },
          ["timeline", "canvas", "inspector", "programme"]);
      }
      case "spatial.edit": {
        this.#requireRevisions(command.expectedProjectRevision, command.expectedViewRevision);
        const project = this.#projectService.snapshot().project;
        const view = this.#viewService.snapshot().view;
        const capabilities = resolveNleSpatialItemCapabilities(project, view);
        assertNleSpatialEditAllowed(capabilities, command.item, command.edit);
        const transaction = planNleSpatialEdit(project, command.item, command.edit);
        assertNleViewAllowsProjectTransaction(view, project, transaction);
        this.#projectService.transact({
          expectedRevision: command.expectedProjectRevision,
          commands: transaction.commands,
        });
        return this.#receipt({ project: true, view: false },
          ["timeline", "canvas", "inspector", "programme"]);
      }
      case "component-value.edit": {
        this.#requireRevisions(command.expectedProjectRevision, command.expectedViewRevision);
        const project = this.#projectService.snapshot().project;
        const view = this.#viewService.snapshot().view;
        const transaction = planNleComponentValueEdit(project, command.item, command.edit);
        assertNleViewAllowsProjectTransaction(view, project, transaction);
        this.#projectService.transact({
          expectedRevision: command.expectedProjectRevision,
          commands: transaction.commands,
        });
        return this.#receipt({ project: true, view: false },
          ["timeline", "canvas", "inspector", "programme"]);
      }
      case "project.undo":
        this.#requireProjectRevision(command.expectedProjectRevision);
        this.#projectService.undo(command.expectedProjectRevision);
        return this.#receipt({ project: true, view: false },
          ["timeline", "canvas", "inspector", "programme"]);
      case "project.redo":
        this.#requireProjectRevision(command.expectedProjectRevision);
        this.#projectService.redo(command.expectedProjectRevision);
        return this.#receipt({ project: true, view: false },
          ["timeline", "canvas", "inspector", "programme"]);
      case "view.undo":
        this.#requireViewRevision(command.expectedViewRevision);
        this.#viewService.undo(command.expectedViewRevision);
        return this.#receipt({ project: false, view: true }, ["timeline", "canvas", "inspector"]);
      case "view.redo":
        this.#requireViewRevision(command.expectedViewRevision);
        this.#viewService.redo(command.expectedViewRevision);
        return this.#receipt({ project: false, view: true }, ["timeline", "canvas", "inspector"]);
      case "view.reconcile":
        this.#requireRevisions(command.expectedProjectRevision, command.expectedViewRevision);
        {
          const before = this.#viewService.snapshot().revision;
          const after = this.#viewService.reconcile(
            this.#projectService.snapshot().project, command.expectedViewRevision,
          );
          const changed = after.revision !== before;
          return this.#receipt(
            { project: false, view: changed },
            changed ? ["timeline", "canvas", "inspector"] : [],
          );
        }
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#unsubscribeProject();
    this.#unsubscribeView();
    this.#listeners.clear();
  }
}

export function openNleEditingSurface(
  projectService: NleProjectService,
  viewService: NleViewService,
  options: NleEditingSurfaceOptions = {},
): NleEditingSurface {
  return new NleEditingSurface(projectService, viewService, options);
}

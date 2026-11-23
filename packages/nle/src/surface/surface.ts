import { planNleSpatialEdit } from "../spatial-authoring.js";
import { planNleComponentValueEdit } from "../component-value-authoring.js";
import { findNleComposition } from "../project.js";
import { type NleProjectService } from "../service.js";
import type { NleProject } from "../types.js";
import { allNleCanvasAffordances, assertNleSpatialEditAllowed, projectNleCanvas, resolveNleSpatialItemCapabilities } from "./canvas.js";
import { allNleTimelineAffordances, resolveNleTimelineItemCapabilities } from "./capabilities.js";
import { assertNleProjectEditAllowed } from "./guard.js";
import { createNleInspectorPresentationHost, type NleInspectorPresentationContribution } from "./inspector.js";
import { mergeNleTimelineItemObservations, projectNleTimeline } from "./projection.js";
import type { NleAuthoringHost } from "./authoring.js";
import type { NleComponentDefinitions } from "./component-definition.js";
import type { NleCanvasAffordancePolicy, NleTimelineAffordancePolicy, NleTimelineItemObservation } from "./projection-types.js";
import type {
  NleEditingContext,
  NleEditingSurfaceChange,
  NleEditingSurfaceCommand,
  NleEditingSurfaceListener,
  NleEditingSurfaceObservation,
  NleEditingSurfaceObservationRequest,
  NleEditingSurfaceOpen,
  NleEditingSurfaceReceipt,
  NleEditingSurfaceStatus,
} from "./types.js";

export class NleEditingSurfaceRevisionConflict extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`NLE Project changed: expected revision ${expected}, found ${actual}.`);
    this.name = "NleEditingSurfaceRevisionConflict";
  }
}

export type NleEditingSurfaceOptions = {
  readonly context?: NleEditingContext;
  readonly authoring?: NleAuthoringHost;
  readonly componentDefinitions?: NleComponentDefinitions;
  readonly inspectorPresentations?: readonly NleInspectorPresentationContribution[];
  readonly timelinePolicy?: NleTimelineAffordancePolicy;
  readonly canvasPolicy?: NleCanvasAffordancePolicy;
};

/**
 * Editing port over an open Project Service and caller-supplied editing context.
 * It owns no author facts, persistence, transport or audiovisual Action lifecycle.
 */
export class NleEditingSurface {
  readonly #projectService: NleProjectService;
  readonly #options: NleEditingSurfaceOptions;
  readonly #inspector: ReturnType<typeof createNleInspectorPresentationHost>;
  readonly #listeners = new Set<NleEditingSurfaceListener>();
  readonly #unsubscribeProject: () => void;
  #closed = false;

  constructor(
    projectService: NleProjectService,
    options: NleEditingSurfaceOptions = {},
  ) {
    this.#projectService = projectService;
    this.#options = options;
    this.#inspector = createNleInspectorPresentationHost(
      options.inspectorPresentations ?? [], options.authoring,
    );
    this.#unsubscribeProject = projectService.subscribe((change) => {
      this.#emit({ kind: change.kind, status: this.status() });
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
    if (expected !== actual) throw new NleEditingSurfaceRevisionConflict(expected, actual);
  }

  status(): NleEditingSurfaceStatus {
    this.#assertOpen();
    const project = this.#projectService.snapshot();
    return {
      projectRevision: project.revision,
      projectDirty: project.dirty,
      projectHistory: { canUndo: project.canUndo, canRedo: project.canRedo },
    };
  }

  subscribe(listener: NleEditingSurfaceListener): () => void {
    this.#assertOpen();
    if (typeof listener !== "function") throw new Error("NLE Editing Surface listener must be a function.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #observations(
    project: NleProject, editing: NleEditingContext, extra: readonly NleTimelineItemObservation[],
  ): readonly NleTimelineItemObservation[] {
    const packaged = this.#options.componentDefinitions?.text(
      findNleComposition(project, editing.activeComposition),
    ) ?? [];
    return mergeNleTimelineItemObservations([...packaged, ...extra]);
  }

  #context(project: NleProject): NleEditingContext {
    return this.#options.context ?? { activeComposition: project.rootComposition, lockedTracks: new Set() };
  }

  #open(observations: readonly NleTimelineItemObservation[]): NleEditingSurfaceOpen {
    const project = this.#projectService.snapshot();
    const editing = this.#context(project.project);
    const merged = this.#observations(project.project, editing, observations);
    const timelineCapabilities = resolveNleTimelineItemCapabilities(
      project.project, editing, this.#options.authoring,
    );
    const spatialCapabilities = resolveNleSpatialItemCapabilities(project.project, editing);
    return {
      status: this.status(),
      project,
      timelineCapabilities,
      spatialCapabilities,
      timeline: projectNleTimeline(
        project.project,
        editing,
        merged,
        timelineCapabilities,
        this.#options.timelinePolicy ?? allNleTimelineAffordances,
      ),
      canvas: projectNleCanvas(
        project.project,
        editing,
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
    const editing = this.#context(project);
    if (request.kind === "transition-inspector") {
      return { kind: request.kind, value: this.#inspector.transitionScene(project, editing, request.transition) };
    }
    const observations = this.#observations(project, editing, extra);
    if (request.kind === "timeline") {
      const capabilities = resolveNleTimelineItemCapabilities(project, editing, this.#options.authoring);
      return { kind: "timeline", value: projectNleTimeline(
        project, editing, observations, capabilities,
        this.#options.timelinePolicy ?? allNleTimelineAffordances,
      ) };
    }
    if (request.kind === "canvas") {
      const capabilities = resolveNleSpatialItemCapabilities(project, editing);
      return { kind: "canvas", value: projectNleCanvas(
        project, editing, observations, capabilities,
        this.#options.canvasPolicy ?? allNleCanvasAffordances,
      ) };
    }
    return {
      kind: "inspector",
      value: this.#inspector.scene(project, editing, request.item, observations),
    };
  }

  command(command: NleEditingSurfaceCommand): NleEditingSurfaceReceipt {
    this.#assertOpen();
    this.#requireProjectRevision(command.expectedProjectRevision);
    const project = this.#projectService.snapshot().project;
    const editing = this.#context(project);
    const invalidated = ["timeline", "canvas", "inspector", "programme"] as const;

    if (command.kind === "project.undo" || command.kind === "project.redo") {
      if (command.kind === "project.undo") this.#projectService.undo(command.expectedProjectRevision);
      else this.#projectService.redo(command.expectedProjectRevision);
      return { status: this.status(), projectChanged: true, invalidated };
    }

    let transaction;
    switch (command.kind) {
      case "project.transact":
        transaction = { commands: command.commands };
        break;
      case "inspector.edit":
        transaction = this.#inspector.planEdit(project, editing, command.item, command.section, command.field, command.value);
        break;
      case "inspector.invoke":
        transaction = this.#inspector.planRowAction(project, editing, command.item, command);
        break;
      case "transition-inspector.edit":
        transaction = this.#inspector.planTransitionEdit(project, editing, command.transition, command.section, command.field, command.value);
        break;
      case "spatial.edit": {
        const capabilities = resolveNleSpatialItemCapabilities(project, editing);
        assertNleSpatialEditAllowed(capabilities, command.item, command.edit);
        transaction = planNleSpatialEdit(project, command.item, command.edit);
        break;
      }
      case "component-value.edit":
        transaction = planNleComponentValueEdit(project, command.item, command.edit);
        break;
      default: {
        const unknown: never = command;
        throw new Error(`Unknown NLE Editing Surface command: ${String((unknown as { kind?: unknown }).kind)}.`);
      }
    }

    const completed = assertNleProjectEditAllowed(editing, project, transaction, command.kind === "project.transact"
      ? resolveNleTimelineItemCapabilities(project, editing, this.#options.authoring) : undefined);
    this.#options.componentDefinitions?.assertProject(completed);
    this.#projectService.transact({ expectedRevision: command.expectedProjectRevision, commands: transaction.commands });
    return { status: this.status(), projectChanged: true, invalidated };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#unsubscribeProject();
    this.#listeners.clear();
  }
}

export function openNleEditingSurface(
  projectService: NleProjectService,
  options: NleEditingSurfaceOptions = {},
): NleEditingSurface {
  return new NleEditingSurface(projectService, options);
}

import { readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { digestPath, executionId, persistExecutionState } from "./state-files.js";

export type RouteKind = "reconstruction" | "description" | "variant" | "variant-package";
export type RouteStatus = "active" | "complete" | "blocked";
export type ReconstructionRouteStep =
  | "environment" | "reference-prepared" | "reference-observed" | "vocabulary-checked"
  | "package-ready" | "script-checked" | "source-authored" | "graph-checked" | "layout-checked"
  | "review-planned" | "preview-rendered" | "comparison-complete" | "repairs-complete"
  | "final-checked" | "build-complete";
export type DescriptionRouteStep =
  | "environment" | "brief-frozen" | "vocabulary-checked" | "package-ready"
  | "script-checked" | "source-authored" | "graph-checked" | "layout-checked" | "review-planned"
  | "preview-rendered" | "review-complete" | "repairs-complete" | "final-checked"
  | "build-complete";
export type VariantRouteStep =
  | "baseline-copied" | "brief-frozen" | "change-scope-frozen" | "guidance-loaded"
  | "vocabulary-verified" | "package-ready" | "script-checked" | "source-updated"
  | "graph-checked" | "layout-checked" | "final-checked" | "variant-complete";
export type VariantPackageRouteStep =
  | "gap-confirmed" | "guidance-loaded" | "types-frozen" | "implemented"
  | "vocabulary-inspected" | "package-validated" | "graph-checked" | "layout-checked" | "package-ready";
export type RouteStep = ReconstructionRouteStep | DescriptionRouteStep | VariantRouteStep | VariantPackageRouteStep;

export type RouteState = {
  readonly version: 4;
  readonly route_id: string;
  readonly route: RouteKind;
  readonly project_root: string;
  readonly run?: string;
  readonly reference_id?: string;
  readonly status: RouteStatus;
  readonly current_step: number;
  readonly completed_steps: readonly number[];
  readonly in_progress: { readonly step: number; readonly started_at: string } | null;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly artifact_digests: Readonly<Record<string, string>>;
  readonly decisions: readonly string[];
  readonly next_action: string;
  readonly last_command?: string;
  readonly last_error?: string;
  readonly conflicts?: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
};

export type RouteStateInput = {
  readonly projectRoot: string;
  readonly route: RouteKind;
  readonly run?: string;
  readonly referenceId?: string;
};

export type RouteCheckpointInput = RouteStateInput & {
  readonly step: number | RouteStep;
  readonly status?: "in_progress" | "complete" | "blocked";
  readonly nextAction?: string;
  readonly artifacts?: Readonly<Record<string, string>>;
  readonly decision?: string;
  readonly command?: string;
  readonly error?: string;
};

export const COMPONENT_FIT_VERSION = 1 as const;
const COMPONENT_FIT_DECISIONS = new Set([
  "reuse-existing",
  "reuse-with-accepted-variance",
  "project-local-package",
]);

export const ROUTE_STATE_VERSION = 4 as const;
const PREVIOUS_ROUTE_STATE_VERSION = 3 as const;
const EARLIER_ROUTE_STATE_VERSION = 2 as const;
const LEGACY_ROUTE_STATE_VERSION = 1 as const;
const LEGACY_ROUTE_STATE_STEPS: Readonly<Record<RouteKind, readonly string[]>> = {
  reconstruction: [
    "environment", "reference-prepared", "reference-observed", "source-authored", "graph-checked",
    "review-planned", "preview-rendered", "comparison-complete", "repairs-complete", "final-checked", "build-complete",
  ],
  description: [
    "environment", "brief-frozen", "source-authored", "vocabulary-checked", "graph-checked",
    "review-planned", "preview-rendered", "review-complete", "repairs-complete", "final-checked", "build-complete",
  ],
  variant: [],
  "variant-package": [],
};

export const ROUTE_STATE_STEPS: Readonly<Record<RouteKind, readonly string[]>> = {
  reconstruction: [
    "environment", "reference-prepared", "reference-observed", "vocabulary-checked", "package-ready",
    "script-checked", "source-authored", "graph-checked", "layout-checked", "review-planned", "preview-rendered",
    "comparison-complete", "repairs-complete", "final-checked", "build-complete",
  ],
  description: [
    "environment", "brief-frozen", "vocabulary-checked", "package-ready", "script-checked", "source-authored",
    "graph-checked", "layout-checked", "review-planned", "preview-rendered", "review-complete", "repairs-complete", "final-checked", "build-complete",
  ],
  variant: [
    "baseline-copied", "brief-frozen", "change-scope-frozen", "guidance-loaded", "vocabulary-verified",
    "package-ready", "script-checked", "source-updated", "graph-checked", "layout-checked", "final-checked", "variant-complete",
  ],
  "variant-package": [
    "gap-confirmed", "guidance-loaded", "types-frozen", "implemented", "vocabulary-inspected",
    "package-validated", "graph-checked", "layout-checked", "package-ready",
  ],
};

const PREVIOUS_ROUTE_STATE_STEPS: Readonly<Record<RouteKind, readonly string[]>> = {
  reconstruction: ["environment", "reference-prepared", "reference-observed", "vocabulary-checked", "package-ready", "script-checked", "source-authored", "graph-checked", "review-planned", "preview-rendered", "comparison-complete", "repairs-complete", "final-checked", "build-complete"],
  description: ["environment", "brief-frozen", "vocabulary-checked", "package-ready", "script-checked", "source-authored", "graph-checked", "review-planned", "preview-rendered", "review-complete", "repairs-complete", "final-checked", "build-complete"],
  variant: ["baseline-copied", "brief-frozen", "change-scope-frozen", "guidance-loaded", "vocabulary-verified", "package-ready", "script-checked", "source-updated", "graph-checked", "final-checked", "variant-complete"],
  "variant-package": ["gap-confirmed", "guidance-loaded", "types-frozen", "implemented", "vocabulary-inspected", "package-validated", "graph-checked", "package-ready"],
};

export function routeStatePath(projectRoot: string): string {
  return join(resolve(projectRoot), ".hypit", "route-state.json");
}

export function componentFitPath(projectRoot: string): string {
  return join(resolve(projectRoot), ".hypit", "component-fit.json");
}

export function routeExecutionStatePath(projectRoot: string, routeId: string): string {
  return join(resolve(projectRoot), ".hypit", "routes", routeId, "state.json");
}

function isCreationRoute(route: RouteKind): route is "description" | "reconstruction" {
  return route === "description" || route === "reconstruction";
}

function assertComponentFit(value: unknown, path: string, route: "description" | "reconstruction"): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`component fit at ${path} is not an object`);
  }
  const fit = value as {
    version?: unknown;
    route?: unknown;
    basis?: unknown;
    systems?: unknown;
  };
  if (fit.version !== COMPONENT_FIT_VERSION) throw new Error(`component fit at ${path} has unsupported version`);
  if (fit.route !== route) throw new Error(`component fit at ${path} is for ${String(fit.route)}, not ${route}`);
  if (typeof fit.basis !== "string" || fit.basis.trim().length === 0) throw new Error(`component fit at ${path} has no basis`);
  if (!Array.isArray(fit.systems) || fit.systems.length === 0) throw new Error(`component fit at ${path} has no visual systems`);
  for (const [index, value] of fit.systems.entries()) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`component fit at ${path} has an invalid system at index ${index}`);
    }
    const system = value as {
      role?: unknown;
      inspected_candidates?: unknown;
      selected_package?: unknown;
      decision?: unknown;
      rationale?: unknown;
      accepted_variances?: unknown;
    };
    if (typeof system.role !== "string" || system.role.trim().length === 0) throw new Error(`component fit at ${path} system ${index} has no role`);
    if (!Array.isArray(system.inspected_candidates) || system.inspected_candidates.some((item) => typeof item !== "string")) {
      throw new Error(`component fit at ${path} system ${index} has invalid inspected_candidates`);
    }
    if (typeof system.selected_package !== "string" || system.selected_package.trim().length === 0) throw new Error(`component fit at ${path} system ${index} has no selected_package`);
    if (typeof system.decision !== "string" || !COMPONENT_FIT_DECISIONS.has(system.decision)) throw new Error(`component fit at ${path} system ${index} has an invalid decision`);
    if (typeof system.rationale !== "string" || system.rationale.trim().length === 0) throw new Error(`component fit at ${path} system ${index} has no rationale`);
    if (!Array.isArray(system.accepted_variances)) throw new Error(`component fit at ${path} system ${index} has invalid accepted_variances`);
    if (system.decision === "reuse-with-accepted-variance" && system.accepted_variances.length === 0) {
      throw new Error(`component fit at ${path} system ${index} accepts variance but names none`);
    }
    if (system.decision !== "reuse-with-accepted-variance" && system.accepted_variances.length > 0) {
      throw new Error(`component fit at ${path} system ${index} names variance for ${system.decision}`);
    }
  }
}

export async function componentFitSatisfied(projectRoot: string, route: RouteKind): Promise<boolean> {
  if (!isCreationRoute(route)) return false;
  const path = componentFitPath(projectRoot);
  try {
    assertComponentFit(JSON.parse(await readFile(path, "utf8")), path, route);
    return true;
  } catch {
    return false;
  }
}

function assertRouteState(value: unknown, path: string): asserts value is RouteState {
  if (value === null || typeof value !== "object") throw new Error(`route state at ${path} is not an object`);
  const state = value as Partial<RouteState>;
  if (state.version !== ROUTE_STATE_VERSION) throw new Error(`route state at ${path} has unsupported version`);
  if (typeof state.route_id !== "string" || state.route_id.length === 0) throw new Error(`route state at ${path} has no route_id`);
  if (state.route !== "reconstruction" && state.route !== "description" && state.route !== "variant" && state.route !== "variant-package") throw new Error(`route state at ${path} has an invalid route`);
  if (typeof state.project_root !== "string" || state.project_root.length === 0) throw new Error(`route state at ${path} has no project_root`);
  if (typeof state.status !== "string" || !["active", "complete", "blocked"].includes(state.status)) throw new Error(`route state at ${path} has an invalid status`);
  const currentStep = state.current_step;
  if (typeof currentStep !== "number" || !Number.isSafeInteger(currentStep) || currentStep < 1 || currentStep > ROUTE_STATE_STEPS[state.route].length + 1) throw new Error(`route state at ${path} has an invalid current_step`);
  if (!Array.isArray(state.completed_steps) || state.completed_steps.some((step) => !Number.isSafeInteger(step) || step < 1)) throw new Error(`route state at ${path} has invalid completed_steps`);
  if (state.in_progress !== null && (state.in_progress === undefined || typeof state.in_progress !== "object" || !Number.isSafeInteger(state.in_progress.step))) throw new Error(`route state at ${path} has invalid in_progress`);
  if (state.artifacts === null || typeof state.artifacts !== "object" || Array.isArray(state.artifacts)) throw new Error(`route state at ${path} has invalid artifacts`);
  if (state.artifact_digests === null || typeof state.artifact_digests !== "object" || Array.isArray(state.artifact_digests)) throw new Error(`route state at ${path} has invalid artifact_digests`);
  if (!Array.isArray(state.decisions) || state.decisions.some((item) => typeof item !== "string")) throw new Error(`route state at ${path} has invalid decisions`);
  if (state.conflicts !== undefined && (!Array.isArray(state.conflicts) || state.conflicts.some((item) => typeof item !== "string"))) throw new Error(`route state at ${path} has invalid conflicts`);
  if (typeof state.next_action !== "string" || typeof state.created_at !== "string" || typeof state.updated_at !== "string") throw new Error(`route state at ${path} is missing recovery fields`);
}

function migrateLegacyRouteState(value: unknown, path: string): RouteState | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const version = (value as { version?: unknown }).version;
  if (version === PREVIOUS_ROUTE_STATE_VERSION) {
    const previous = value as Omit<RouteState, "version" | "completed_steps" | "current_step" | "in_progress"> & {
      readonly version: 3;
      readonly completed_steps: readonly number[];
      readonly current_step: number;
      readonly in_progress: { readonly step: number; readonly started_at: string } | null;
    };
    const names = previous.completed_steps.map((step) => PREVIOUS_ROUTE_STATE_STEPS[previous.route][step - 1]).filter((name): name is string => name !== undefined);
    const completed = previous.status === "complete"
      ? ROUTE_STATE_STEPS[previous.route].map((_name, index) => index + 1)
      : names.flatMap((name) => {
          const index = ROUTE_STATE_STEPS[previous.route].indexOf(name);
          return index < 0 ? [] : [index + 1];
        });
    const currentStep = nextUncompleted(previous.route, completed);
    return {
      ...previous,
      version: ROUTE_STATE_VERSION,
      current_step: currentStep,
      completed_steps: completed,
      in_progress: currentStep > ROUTE_STATE_STEPS[previous.route].length ? null : { step: currentStep, started_at: previous.updated_at },
      next_action: currentStep > ROUTE_STATE_STEPS[previous.route].length ? "route complete" : `complete ${ROUTE_STATE_STEPS[previous.route][currentStep - 1]}`,
    };
  }
  if (version === EARLIER_ROUTE_STATE_VERSION) {
    const previous = value as Omit<RouteState, "version" | "route_id" | "artifact_digests" | "created_at" | "completed_steps" | "current_step" | "in_progress"> & {
      readonly version: 2;
      readonly completed_steps: readonly number[];
      readonly current_step: number;
      readonly in_progress: { readonly step: number; readonly started_at: string } | null;
    };
    const createdAt = typeof previous.updated_at === "string" ? previous.updated_at : new Date().toISOString();
    const names = previous.completed_steps.map((step) => PREVIOUS_ROUTE_STATE_STEPS[previous.route][step - 1]).filter((name): name is string => name !== undefined);
    const completed = previous.status === "complete"
      ? ROUTE_STATE_STEPS[previous.route].map((_name, index) => index + 1)
      : names.flatMap((name) => {
          const index = ROUTE_STATE_STEPS[previous.route].indexOf(name);
          return index < 0 ? [] : [index + 1];
        });
    const currentStep = nextUncompleted(previous.route, completed);
    return {
      ...previous,
      version: ROUTE_STATE_VERSION,
      route_id: executionId(previous.route ?? "route"),
      artifact_digests: {},
      created_at: createdAt,
      current_step: currentStep,
      completed_steps: completed,
      in_progress: currentStep > ROUTE_STATE_STEPS[previous.route].length ? null : { step: currentStep, started_at: createdAt },
      next_action: currentStep > ROUTE_STATE_STEPS[previous.route].length ? "route complete" : `complete ${ROUTE_STATE_STEPS[previous.route][currentStep - 1]}`,
    };
  }
  if (version !== LEGACY_ROUTE_STATE_VERSION) return undefined;
  const legacy = value as Partial<RouteState>;
  if (legacy.route !== "reconstruction" && legacy.route !== "description") throw new Error(`route state at ${path} has an invalid route`);
  const route = legacy.route;
  if (typeof legacy.project_root !== "string" || legacy.project_root.length === 0) throw new Error(`route state at ${path} has no project_root`);
  const oldSteps = LEGACY_ROUTE_STATE_STEPS[route];
  if (!Array.isArray(legacy.completed_steps) || legacy.completed_steps.some((step) => !Number.isSafeInteger(step) || step < 1 || step > oldSteps.length)) {
    throw new Error(`route state at ${path} has invalid legacy completed_steps`);
  }
  const completedNames = legacy.completed_steps.map((step) => oldSteps[step - 1]!).filter(Boolean);
  let completed = completedNames.flatMap((name) => {
    const index = ROUTE_STATE_STEPS[route].indexOf(name);
    return index < 0 ? [] : [index + 1];
  });
  // A legacy snapshot could claim source-authored (and later gates) before the v2 vocabulary,
  // package and Script gates existed. Re-open that point and everything after it; artifacts/checks
  // will earn the new stages again instead of letting an old numeric cursor bless an unverified package.
  const sourceStage = ROUTE_STATE_STEPS[route].indexOf("source-authored") + 1;
  const requiredStages = ["vocabulary-checked", "package-ready", "script-checked"]
    .map((name) => ROUTE_STATE_STEPS[route].indexOf(name) + 1);
  if (completed.includes(sourceStage) && requiredStages.some((stage) => !completed.includes(stage))) {
    completed = completed.filter((stage) => stage < sourceStage);
  }
  // New gates are intentionally re-opened during migration. The first unmet predicate, not the
  // legacy numeric cursor, is the only safe recovery point.
  const currentStep = nextUncompleted(route, completed);
  const now = new Date().toISOString();
  return {
    version: ROUTE_STATE_VERSION,
    route_id: executionId(route),
    route,
    project_root: legacy.project_root!,
    ...(legacy.run === undefined ? {} : { run: legacy.run }),
    ...(legacy.reference_id === undefined ? {} : { reference_id: legacy.reference_id }),
    status: currentStep > ROUTE_STATE_STEPS[route].length ? "complete" : "active",
    current_step: currentStep,
    completed_steps: [...new Set(completed)].sort((a, b) => a - b),
    in_progress: currentStep > ROUTE_STATE_STEPS[route].length ? null : { step: currentStep, started_at: now },
    artifacts: legacy.artifacts ?? {},
    artifact_digests: {},
    decisions: legacy.decisions ?? [],
    // Legacy prose may point past the newly inserted gates; always derive the recovery action from
    // the first unmet v2 stage instead of carrying that stale cursor forward.
    next_action: currentStep > ROUTE_STATE_STEPS[route].length
      ? "route complete"
      : `complete ${ROUTE_STATE_STEPS[route][currentStep - 1]}`,
    ...(legacy.last_command === undefined ? {} : { last_command: legacy.last_command }),
    ...(legacy.last_error === undefined ? {} : { last_error: legacy.last_error }),
    created_at: now,
    updated_at: now,
  };
}

export async function readRouteState(projectRoot: string): Promise<RouteState | undefined> {
  const path = routeStatePath(projectRoot);
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (text === undefined) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) {
    throw new Error(`route state at ${path} is invalid JSON; original file was preserved: ${error instanceof Error ? error.message : String(error)}`);
  }
  const migrated = migrateLegacyRouteState(parsed, path);
  if (migrated !== undefined) {
    await writeRouteState(migrated);
    return migrated;
  }
  assertRouteState(parsed, path);
  return parsed;
}

async function writeRouteState(state: RouteState): Promise<RouteState> {
  await persistExecutionState(state.project_root, "route-state.json", "routes", state.route_id, state);
  return state;
}

function nextUncompleted(route: RouteKind, completed: readonly number[]): number {
  const done = new Set(completed);
  const steps = ROUTE_STATE_STEPS[route];
  for (let step = 1; step <= steps.length; step += 1) if (!done.has(step)) return step;
  return steps.length + 1;
}

function stageNumber(route: RouteKind, name: string): number {
  const index = ROUTE_STATE_STEPS[route].indexOf(name);
  if (index < 0) throw new Error(`route ${route} has no ${name} stage`);
  return index + 1;
}

const SCALAR_ARTIFACT_KEYS = new Set(["observer", "timing_basis", "timingBasis", "mode", "status"]);
function normalizeArtifact(projectRoot: string, key: string, value: string): string {
  // Artifact maps historically accepted strings for both file references and tiny metadata values.
  // Preserve the latter; resolving `observer: "gemini"` as a filesystem path corrupts the snapshot.
  return SCALAR_ARTIFACT_KEYS.has(key) ? value : resolve(projectRoot, value);
}

function stepNumber(route: RouteKind, step: number | RouteStep): number {
  if (typeof step === "number") {
    if (!Number.isSafeInteger(step) || step < 1 || step > ROUTE_STATE_STEPS[route].length) {
      throw new Error(`step ${step} is outside the ${route} route`);
    }
    return step;
  }
  return stageNumber(route, step);
}

function assertPriorStagesComplete(route: RouteKind, step: number, completed: ReadonlySet<number>): void {
  const missing = Array.from({ length: step - 1 }, (_, index) => index + 1)
    .filter((candidate) => !completed.has(candidate));
  if (missing.length > 0) {
    const names = missing.map((candidate) => ROUTE_STATE_STEPS[route][candidate - 1]).join(", ");
    throw new Error(`cannot complete ${ROUTE_STATE_STEPS[route][step - 1]} before ${names}`);
  }
}

/** Source cannot be accepted until vocabulary, package and Script gates are durable. */
function assertSourcePrerequisites(route: RouteKind, step: number, completed: ReadonlySet<number>): void {
  const sourceStage = route === "variant" ? "source-updated"
    : route === "variant-package" ? "implemented" : "source-authored";
  if (step !== stageNumber(route, sourceStage)) return;
  const required = route === "variant"
    ? ["vocabulary-verified", "package-ready", "script-checked"]
    : route === "variant-package" ? [] : ["vocabulary-checked", "package-ready", "script-checked"];
  const requiredSteps = required
    .map((name) => stageNumber(route, name));
  const missing = requiredSteps.filter((item) => !completed.has(item));
  if (missing.length > 0) {
    const names = missing.map((item) => ROUTE_STATE_STEPS[route][item - 1]).join(", ");
    throw new Error(`${sourceStage} cannot be completed before ${names}`);
  }
}

export async function startRouteState(input: RouteStateInput): Promise<RouteState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRouteState(projectRoot);
  if (existing !== undefined && existing.status !== "complete" && (existing.route !== input.route || existing.project_root !== projectRoot)) {
    throw new Error(`project already has an active ${existing.route} route at ${routeStatePath(projectRoot)}`);
  }
  if (existing !== undefined && existing.status !== "complete" && existing.route === input.route) return existing;
  const now = new Date().toISOString();
  return await writeRouteState({
    version: ROUTE_STATE_VERSION,
    route_id: executionId(input.route),
    route: input.route,
    project_root: projectRoot,
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(input.referenceId === undefined ? {} : { reference_id: input.referenceId }),
    status: "active",
    current_step: 1,
    completed_steps: [],
    in_progress: { step: 1, started_at: now },
    artifacts: existing?.artifacts.brief === undefined ? {} : { brief: existing.artifacts.brief },
    artifact_digests: existing?.artifact_digests.brief === undefined ? {} : { brief: existing.artifact_digests.brief },
    decisions: [],
    next_action: `complete ${ROUTE_STATE_STEPS[input.route][0]}`,
    created_at: now,
    updated_at: now,
  });
}

export async function checkpointRouteState(input: RouteCheckpointInput): Promise<RouteState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRouteState(projectRoot);
  if (existing === undefined) throw new Error(`no route state at ${routeStatePath(projectRoot)}; run route_state start first`);
  if (existing.route !== input.route) throw new Error(`route state is ${existing.route}, not ${input.route}`);
  if (existing.status === "complete") throw new Error(`route ${existing.route_id} is complete; start a new route instead of rewriting its history`);
  const step = stepNumber(input.route, input.step);
  const completed = new Set(existing.completed_steps);
  const status = input.status ?? "complete";
  const artifacts = input.artifacts === undefined ? existing.artifacts : {
    ...existing.artifacts,
    ...Object.fromEntries(
      Object.entries(input.artifacts).map(([key, value]) => [key, normalizeArtifact(projectRoot, key, value)]),
    ),
  };
  if (input.artifacts?.component_fit !== undefined
    && (!isCreationRoute(input.route) || step !== stageNumber(input.route, "vocabulary-checked"))) {
    throw new Error("component_fit may be checkpointed only with vocabulary-checked on a creation route");
  }
  if (input.route === "description" && step === stageNumber("description", "brief-frozen") && status === "complete") {
    const brief = artifacts.brief;
    const canonical = join(projectRoot, ".hypit", "brief.json");
    if (brief === undefined || resolve(projectRoot, brief) !== canonical) {
      throw new Error(`brief-frozen requires the canonical brief at ${canonical}`);
    }
    let parsedBrief: unknown;
    try { parsedBrief = JSON.parse(await readFile(canonical, "utf8")); }
    catch (error) { throw new Error(`brief-frozen requires valid JSON at ${canonical}: ${error instanceof Error ? error.message : String(error)}`); }
    if (parsedBrief === null || typeof parsedBrief !== "object" || Array.isArray(parsedBrief)) throw new Error(`brief-frozen requires a JSON object at ${canonical}`);
    const actualDigest = await digestPath(canonical);
    const frozenDigest = existing.artifact_digests.brief;
    if (frozenDigest !== undefined && actualDigest !== frozenDigest) {
      throw new Error(`the frozen base brief changed: expected ${frozenDigest}, found ${actualDigest ?? "missing"}; use Revision or a new project`);
    }
  }
  if (isCreationRoute(input.route) && step === stageNumber(input.route, "vocabulary-checked")) {
    const canonical = componentFitPath(projectRoot);
    const fit = artifacts.component_fit;
    if (fit !== undefined && fit !== canonical) throw new Error(`component fit must use the canonical path ${canonical}`);
    if (fit !== undefined && !(await componentFitSatisfied(projectRoot, input.route))) {
      throw new Error(`component fit at ${canonical} is missing or invalid`);
    }
    const frozenDigest = existing.artifact_digests.component_fit;
    const actualDigest = fit === undefined ? undefined : await digestPath(canonical);
    if (completed.has(step) && frozenDigest !== undefined && actualDigest !== frozenDigest) {
      throw new Error("component fit changed after it was frozen; run route_state reconcile before reclassifying it");
    }
    if (status === "complete") {
      if (!(await evidenceSatisfied("vocabulary", artifacts.vocabulary))) {
        throw new Error("vocabulary-checked requires valid Run-scoped vocabulary evidence");
      }
      if (fit !== canonical || !(await componentFitSatisfied(projectRoot, input.route))) {
        throw new Error(`vocabulary-checked requires the canonical component fit at ${canonical}`);
      }
    }
  }
  if (status === "complete") {
    // Named checkpoints are explicit user assertions and must not jump over earlier stages. Numeric
    // checkpoints remain compatible with route-aware automation, which may record a later durable
    // artifact before an earlier manual checkpoint is written; reconcile still keeps that manual gap.
    if (typeof input.step === "string") assertPriorStagesComplete(input.route, step, completed);
    assertSourcePrerequisites(input.route, step, completed);
    completed.add(step);
  }
  const completedSteps = [...completed].sort((a, b) => a - b);
  const next = status === "complete" ? nextUncompleted(input.route, completedSteps) : step;
  const now = new Date().toISOString();
  const decisions = input.decision === undefined || input.decision.trim().length === 0 || existing.decisions.includes(input.decision)
    ? existing.decisions
    : [...existing.decisions, input.decision.trim()];
  const artifactDigests: Record<string, string> = { ...existing.artifact_digests };
  const frozenKeys = new Set(["brief", "vocabulary", "component_fit", "baseline_manifest", "variant_brief", "allowed_changes", "guidance", "gap_plan", "types", "package_digest", "layout_check", "layout_decisions"]);
  for (const [key, value] of Object.entries(artifacts)) {
    if (!frozenKeys.has(key) && !value.includes(`${sep}.hypit${sep}evidence${sep}`)) continue;
    if (key === "component_fit" && input.artifacts?.component_fit === undefined) continue;
    const digest = await digestPath(value);
    if (digest !== undefined) artifactDigests[key] = digest;
  }
  const state: RouteState = {
    ...existing,
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(input.referenceId === undefined ? {} : { reference_id: input.referenceId }),
    status: status === "blocked" ? "blocked" : next > ROUTE_STATE_STEPS[input.route].length ? "complete" : "active",
    current_step: next,
    completed_steps: completedSteps,
    in_progress: status === "in_progress"
      ? { step, started_at: now }
      : status === "complete"
        ? (next > ROUTE_STATE_STEPS[input.route].length ? null : { step: next, started_at: now })
        : existing.in_progress,
    artifacts,
    artifact_digests: artifactDigests,
    decisions,
    next_action: input.nextAction?.trim()
      || (next > ROUTE_STATE_STEPS[input.route].length ? "route complete" : `complete ${ROUTE_STATE_STEPS[input.route][next - 1]}`),
    ...(input.command === undefined ? {} : { last_command: input.command }),
    ...(input.error === undefined ? {} : { last_error: input.error }),
    updated_at: now,
  };
  return await writeRouteState(state);
}

async function exists(path: string | undefined): Promise<boolean> {
  if (path === undefined) return false;
  return await stat(path).then(() => true, () => false);
}

async function evidenceSatisfied(key: string, path: string | undefined): Promise<boolean> {
  if (!(await exists(path)) || path === undefined) return false;
  // Check artifacts are written as JSON by the route-aware commands.  Reconcile deliberately
  // verifies their success predicate instead of treating a stale/failing report as completion.
  if (key === "preview_check") {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as { sound?: unknown };
      return value.sound === true;
    } catch { return false; }
  }
  if (key === "package_ready" || key === "script_cues" || key === "vocabulary") {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as { passed?: unknown; surfaces?: unknown[]; packages?: unknown[] };
      if ((value as { waived?: unknown }).waived === true
        && typeof (value as { diagnosis?: unknown }).diagnosis === "string"
        && ((value as { diagnosis?: string }).diagnosis?.trim().length ?? 0) > 0) return true;
      if (key === "vocabulary") return Array.isArray(value.surfaces) || Array.isArray(value.packages);
      return value.passed === true;
    } catch { return false; }
  }
  if (key === "brief") {
    try {
      const value = JSON.parse(await readFile(path, "utf8"));
      return value !== null && typeof value === "object" && !Array.isArray(value);
    } catch { return false; }
  }
  if (key === "final_check") {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as { passed?: unknown };
      return value.passed === true;
    } catch { return false; }
  }
  if (key === "layout_check") {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as { executed?: unknown; settled?: unknown };
      return value.executed === true && value.settled === true;
    } catch { return false; }
  }
  if (key === "comparison_log" || key === "review_log") {
    try {
      const lines = (await readFile(path, "utf8")).split("\n").filter((line) => line.trim().length > 0);
      return lines.some((line) => {
        try {
          const value = JSON.parse(line) as { status?: unknown };
          return value.status === "complete";
        } catch { return false; }
      });
    } catch { return false; }
  }
  if (key === "reference_state") {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as { shots?: unknown; video?: unknown };
      return Array.isArray(value.shots) && value.video !== undefined;
    } catch { return false; }
  }
  if (key === "reference_observations") {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as Record<string, { status?: unknown }>;
      const entries = Object.values(value);
      return entries.length > 0 && entries.every((item) => item?.status === "complete");
    } catch { return false; }
  }
  return true;
}

async function layoutEvidenceCurrent(path: string | undefined): Promise<boolean> {
  if (path === undefined) return false;
  try {
    const report = JSON.parse(await readFile(path, "utf8")) as { executed?: unknown; settled?: unknown; input_digests?: Record<string, unknown> };
    if (report.executed !== true || report.settled !== true || report.input_digests === undefined) return false;
    for (const [file, expected] of Object.entries(report.input_digests)) {
      if (typeof expected !== "string" || await digestPath(file) !== expected) return false;
    }
    return true;
  } catch { return false; }
}

/** Reconcile a snapshot with the small, durable evidence pointers it records. */
export async function reconcileRouteState(projectRoot: string): Promise<RouteState | undefined> {
  const existing = await readRouteState(projectRoot);
  if (existing === undefined) return undefined;
  const completed = new Set(existing.completed_steps);
  const conflicts: string[] = [];
  for (const [key, expected] of Object.entries(existing.artifact_digests)) {
    const path = existing.artifacts[key];
    const actual = path === undefined ? undefined : await digestPath(path);
    if (actual !== expected) conflicts.push(`${key} digest changed: expected ${expected}, found ${actual ?? "missing"}`);
  }
  const artifact = (name: string): string | undefined => existing.artifacts[name];
  const reconcileStep = async (step: number, key: string): Promise<void> => {
    const renderComplete = key === "preview_render"
      ? await evidenceSatisfied("render_sidecar", artifact("render_sidecar"))
      : true;
    const satisfied = renderComplete && await evidenceSatisfied(key, artifact(key))
      && (key !== "layout_check" || await layoutEvidenceCurrent(artifact(key)));
    if (satisfied) completed.add(step);
    else {
      if (completed.has(step)) conflicts.push(`step ${step} (${key}) was marked complete but its evidence is missing or failed`);
      completed.delete(step);
    }
  };
  const evidenceByStep: Readonly<Record<RouteKind, Readonly<Record<number, string>>>> = {
    reconstruction: {
      2: "reference_state", 3: "reference_observations", 4: "vocabulary", 5: "package_ready", 6: "script_cues",
      7: "author_source", 8: "preview_check", 9: "layout_check", 10: "review_plan", 11: "preview_render", 12: "comparison_log", 14: "final_check", 15: "build",
    },
    description: {
      2: "brief", 3: "vocabulary", 4: "package_ready", 5: "script_cues", 6: "author_source", 7: "preview_check",
      8: "layout_check", 9: "review_plan", 10: "preview_render", 11: "review_log", 13: "final_check", 14: "build",
    },
    variant: {
      1: "baseline_manifest", 2: "variant_brief", 3: "allowed_changes", 4: "guidance",
      5: "vocabulary", 6: "package_ready", 7: "script_cues", 8: "author_source",
      9: "preview_check", 10: "layout_check", 11: "variant_check", 12: "variant_check",
    },
    "variant-package": {
      1: "gap_plan", 2: "guidance", 3: "types", 4: "package_source", 5: "vocabulary",
      6: "package_ready", 7: "preview_check", 8: "layout_check", 9: "package_digest",
    },
  };
  for (const [step, key] of Object.entries(evidenceByStep[existing.route])) {
    await reconcileStep(Number(step), key);
  }
  if (existing.status !== "complete" && isCreationRoute(existing.route)) {
    const vocabularyStep = stageNumber(existing.route, "vocabulary-checked");
    const canonical = componentFitPath(existing.project_root);
    const fitPath = artifact("component_fit");
    const expectedDigest = existing.artifact_digests.component_fit;
    const actualDigest = fitPath === undefined ? undefined : await digestPath(fitPath);
    const fitSatisfied = fitPath === canonical
      && await componentFitSatisfied(existing.project_root, existing.route)
      && expectedDigest !== undefined
      && actualDigest === expectedDigest;
    if (!fitSatisfied) {
      if (completed.has(vocabularyStep)) {
        conflicts.push(`step ${vocabularyStep} (vocabulary-checked) has no valid frozen component fit`);
      }
      for (let step = vocabularyStep; step <= ROUTE_STATE_STEPS[existing.route].length; step += 1) completed.delete(step);
    }
  }
  if (existing.route !== "variant-package") {
    const sourceName = existing.route === "variant" ? "source-updated" : "source-authored";
    const vocabularyName = existing.route === "variant" ? "vocabulary-verified" : "vocabulary-checked";
    const sourceStep = stageNumber(existing.route, sourceName);
    const gateSteps = [vocabularyName, "package-ready", "script-checked"]
      .map((name) => stageNumber(existing.route, name));
    if (completed.has(sourceStep) && gateSteps.some((step) => !completed.has(step))) {
      conflicts.push(`step ${sourceStep} (${sourceName}) was marked complete before vocabulary/package/Script gates`);
      completed.delete(sourceStep);
    }
  }
  const completedSteps = [...completed].sort((a, b) => a - b);
  const next = nextUncompleted(existing.route, completedSteps);
  const now = new Date().toISOString();
  const { conflicts: _oldConflicts, ...withoutConflicts } = existing;
  const state: RouteState = {
    ...withoutConflicts,
    status: next > ROUTE_STATE_STEPS[existing.route].length ? "complete" : existing.status === "blocked" ? "blocked" : "active",
    current_step: next,
    completed_steps: completedSteps,
    in_progress: next > ROUTE_STATE_STEPS[existing.route].length ? null : { step: next, started_at: now },
    next_action: next > ROUTE_STATE_STEPS[existing.route].length ? "route complete" : `complete ${ROUTE_STATE_STEPS[existing.route][next - 1]}`,
    ...(conflicts.length === 0 ? {} : { conflicts }),
    updated_at: now,
  };
  const unchanged = state.status === existing.status
    && state.current_step === existing.current_step
    && JSON.stringify(state.completed_steps) === JSON.stringify(existing.completed_steps)
    && JSON.stringify(state.conflicts ?? []) === JSON.stringify(existing.conflicts ?? [])
    && state.next_action === existing.next_action;
  return unchanged ? existing : await writeRouteState(state);
}

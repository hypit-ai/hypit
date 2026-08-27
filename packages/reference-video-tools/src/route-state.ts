import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type RouteKind = "reconstruction" | "description";
export type RouteStatus = "active" | "complete" | "blocked";

export type RouteState = {
  readonly version: 1;
  readonly route: RouteKind;
  readonly project_root: string;
  readonly run?: string;
  readonly reference_id?: string;
  readonly status: RouteStatus;
  readonly current_step: number;
  readonly completed_steps: readonly number[];
  readonly in_progress: { readonly step: number; readonly started_at: string } | null;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly decisions: readonly string[];
  readonly next_action: string;
  readonly last_command?: string;
  readonly last_error?: string;
  readonly conflicts?: readonly string[];
  readonly updated_at: string;
};

export type RouteStateInput = {
  readonly projectRoot: string;
  readonly route: RouteKind;
  readonly run?: string;
  readonly referenceId?: string;
};

export type RouteCheckpointInput = RouteStateInput & {
  readonly step: number;
  readonly status?: "in_progress" | "complete" | "blocked";
  readonly nextAction?: string;
  readonly artifacts?: Readonly<Record<string, string>>;
  readonly decision?: string;
  readonly command?: string;
  readonly error?: string;
};

export const ROUTE_STATE_VERSION = 1 as const;

export const ROUTE_STATE_STEPS: Readonly<Record<RouteKind, readonly string[]>> = {
  reconstruction: [
    "environment", "reference-prepared", "reference-observed", "source-authored", "graph-checked",
    "review-planned", "preview-rendered", "comparison-complete", "repairs-complete", "final-checked", "build-complete",
  ],
  description: [
    "environment", "brief-frozen", "source-authored", "vocabulary-checked", "graph-checked",
    "review-planned", "preview-rendered", "review-complete", "repairs-complete", "final-checked", "build-complete",
  ],
};

export function routeStatePath(projectRoot: string): string {
  return join(resolve(projectRoot), ".hypit", "route-state.json");
}

function assertRouteState(value: unknown, path: string): asserts value is RouteState {
  if (value === null || typeof value !== "object") throw new Error(`route state at ${path} is not an object`);
  const state = value as Partial<RouteState>;
  if (state.version !== ROUTE_STATE_VERSION) throw new Error(`route state at ${path} has unsupported version`);
  if (state.route !== "reconstruction" && state.route !== "description") throw new Error(`route state at ${path} has an invalid route`);
  if (typeof state.project_root !== "string" || state.project_root.length === 0) throw new Error(`route state at ${path} has no project_root`);
  if (typeof state.status !== "string" || !["active", "complete", "blocked"].includes(state.status)) throw new Error(`route state at ${path} has an invalid status`);
  const currentStep = state.current_step;
  if (typeof currentStep !== "number" || !Number.isSafeInteger(currentStep) || currentStep < 1 || currentStep > ROUTE_STATE_STEPS[state.route].length + 1) throw new Error(`route state at ${path} has an invalid current_step`);
  if (!Array.isArray(state.completed_steps) || state.completed_steps.some((step) => !Number.isSafeInteger(step) || step < 1)) throw new Error(`route state at ${path} has invalid completed_steps`);
  if (state.in_progress !== null && (state.in_progress === undefined || typeof state.in_progress !== "object" || !Number.isSafeInteger(state.in_progress.step))) throw new Error(`route state at ${path} has invalid in_progress`);
  if (state.artifacts === null || typeof state.artifacts !== "object" || Array.isArray(state.artifacts)) throw new Error(`route state at ${path} has invalid artifacts`);
  if (!Array.isArray(state.decisions) || state.decisions.some((item) => typeof item !== "string")) throw new Error(`route state at ${path} has invalid decisions`);
  if (state.conflicts !== undefined && (!Array.isArray(state.conflicts) || state.conflicts.some((item) => typeof item !== "string"))) throw new Error(`route state at ${path} has invalid conflicts`);
  if (typeof state.next_action !== "string" || typeof state.updated_at !== "string") throw new Error(`route state at ${path} is missing recovery fields`);
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
  assertRouteState(parsed, path);
  return parsed;
}

async function writeRouteState(state: RouteState): Promise<RouteState> {
  const path = routeStatePath(state.project_root);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, path);
  return state;
}

function nextUncompleted(route: RouteKind, completed: readonly number[]): number {
  const done = new Set(completed);
  const steps = ROUTE_STATE_STEPS[route];
  for (let step = 1; step <= steps.length; step += 1) if (!done.has(step)) return step;
  return steps.length + 1;
}

export async function startRouteState(input: RouteStateInput): Promise<RouteState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRouteState(projectRoot);
  if (existing !== undefined && existing.status !== "complete" && (existing.route !== input.route || existing.project_root !== projectRoot)) {
    throw new Error(`project already has an active ${existing.route} route at ${routeStatePath(projectRoot)}`);
  }
  if (existing !== undefined && existing.route === input.route) return existing;
  const now = new Date().toISOString();
  return await writeRouteState({
    version: ROUTE_STATE_VERSION,
    route: input.route,
    project_root: projectRoot,
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(input.referenceId === undefined ? {} : { reference_id: input.referenceId }),
    status: "active",
    current_step: 1,
    completed_steps: [],
    in_progress: { step: 1, started_at: now },
    artifacts: {},
    decisions: [],
    next_action: `complete ${ROUTE_STATE_STEPS[input.route][0]}`,
    updated_at: now,
  });
}

export async function checkpointRouteState(input: RouteCheckpointInput): Promise<RouteState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRouteState(projectRoot);
  if (existing === undefined) throw new Error(`no route state at ${routeStatePath(projectRoot)}; run route_state start first`);
  if (existing.route !== input.route) throw new Error(`route state is ${existing.route}, not ${input.route}`);
  if (input.step < 1 || input.step > ROUTE_STATE_STEPS[input.route].length) throw new Error(`step ${input.step} is outside the ${input.route} route`);
  const completed = new Set(existing.completed_steps);
  if (input.status === "complete") completed.add(input.step);
  const completedSteps = [...completed].sort((a, b) => a - b);
  const next = input.status === "complete" ? nextUncompleted(input.route, completedSteps) : input.step;
  const now = new Date().toISOString();
  const decisions = input.decision === undefined || input.decision.trim().length === 0 || existing.decisions.includes(input.decision)
    ? existing.decisions
    : [...existing.decisions, input.decision.trim()];
  const artifacts = input.artifacts === undefined ? existing.artifacts : {
    ...existing.artifacts,
    ...Object.fromEntries(
      Object.entries(input.artifacts).map(([key, value]) => [key, resolve(projectRoot, value)]),
    ),
  };
  const state: RouteState = {
    ...existing,
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(input.referenceId === undefined ? {} : { reference_id: input.referenceId }),
    status: input.status === "blocked" ? "blocked" : next > ROUTE_STATE_STEPS[input.route].length ? "complete" : "active",
    current_step: next,
    completed_steps: completedSteps,
    in_progress: input.status === "in_progress"
      ? { step: input.step, started_at: now }
      : input.status === "complete"
        ? (next > ROUTE_STATE_STEPS[input.route].length ? null : { step: next, started_at: now })
        : existing.in_progress,
    artifacts,
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
  if (key === "final_check") {
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as { passed?: unknown };
      return value.passed === true;
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

/** Reconcile a snapshot with the small, durable evidence pointers it records. */
export async function reconcileRouteState(projectRoot: string): Promise<RouteState | undefined> {
  const existing = await readRouteState(projectRoot);
  if (existing === undefined) return undefined;
  const completed = new Set(existing.completed_steps);
  const conflicts: string[] = [];
  const artifact = (name: string): string | undefined => existing.artifacts[name];
  const reconcileStep = async (step: number, key: string): Promise<void> => {
    const renderComplete = key === "preview_render"
      ? await evidenceSatisfied("render_sidecar", artifact("render_sidecar"))
      : true;
    const satisfied = renderComplete && await evidenceSatisfied(key, artifact(key));
    if (satisfied) completed.add(step);
    else {
      if (completed.has(step)) conflicts.push(`step ${step} (${key}) was marked complete but its evidence is missing or failed`);
      completed.delete(step);
    }
  };
  const evidenceByStep: Readonly<Record<RouteKind, Readonly<Record<number, string>>>> = {
    reconstruction: {
      2: "reference_state", 3: "reference_observations", 4: "author_source", 5: "preview_check",
      6: "review_plan", 7: "preview_render", 8: "comparison_log", 10: "final_check", 11: "build",
    },
    description: {
      2: "brief", 3: "author_source", 4: "vocabulary", 5: "preview_check",
      6: "review_plan", 7: "preview_render", 8: "review_log", 10: "final_check", 11: "build",
    },
  };
  for (const [step, key] of Object.entries(evidenceByStep[existing.route])) {
    await reconcileStep(Number(step), key);
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
  return await writeRouteState(state);
}

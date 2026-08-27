import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

/** A durable, small snapshot for a post-completion natural-language revision. */
export type RevisionStatus = "active" | "complete" | "blocked";
export type RevisionStep =
  | "request-captured"
  | "impact-assessed"
  | "intent-mapped"
  | "source-updated"
  | "gates-checked"
  | "preview-rendered"
  | "review-complete"
  | "final-checked"
  | "revision-complete"
  | "build-complete";

export const REVISION_STATE_VERSION = 1 as const;
export const REVISION_STEPS: readonly RevisionStep[] = [
  "request-captured", "impact-assessed", "intent-mapped", "source-updated", "gates-checked",
  "preview-rendered", "review-complete", "final-checked", "revision-complete", "build-complete",
];

export type RevisionState = {
  readonly version: 1;
  readonly project_root: string;
  readonly run?: string;
  readonly parent_route?: "reconstruction" | "description";
  readonly parent_state_digest?: string;
  readonly status: RevisionStatus;
  readonly current_step: number;
  readonly completed_steps: readonly number[];
  readonly in_progress: { readonly step: number; readonly started_at: string } | null;
  readonly request?: string;
  readonly impact?: readonly string[];
  readonly affected_source?: readonly string[];
  readonly artifacts: Readonly<Record<string, string>>;
  readonly decisions: readonly string[];
  readonly next_action: string;
  readonly last_command?: string;
  readonly last_error?: string;
  readonly conflicts?: readonly string[];
  readonly updated_at: string;
};

export type RevisionStateInput = {
  readonly projectRoot: string;
  readonly run?: string;
  readonly parentRoute?: "reconstruction" | "description";
  readonly parentStateDigest?: string;
  readonly request?: string;
};

export type RevisionCheckpointInput = RevisionStateInput & {
  readonly step: number | RevisionStep;
  readonly status?: "in_progress" | "complete" | "blocked";
  readonly nextAction?: string;
  readonly artifacts?: Readonly<Record<string, string>>;
  readonly decision?: string;
  readonly command?: string;
  readonly error?: string;
  readonly impact?: readonly string[];
  readonly affectedSource?: readonly string[];
};

export function revisionStatePath(projectRoot: string): string {
  return join(resolve(projectRoot), ".hypit", "revision-state.json");
}

function nextUncompleted(completed: readonly number[]): number {
  const done = new Set(completed);
  for (let step = 1; step <= REVISION_STEPS.length; step += 1) if (!done.has(step)) return step;
  return REVISION_STEPS.length + 1;
}

function stepNumber(step: RevisionStep | number): number {
  if (typeof step === "number") {
    if (!Number.isSafeInteger(step) || step < 1 || step > REVISION_STEPS.length) throw new Error(`revision step ${step} is outside the revision route`);
    return step;
  }
  const index = REVISION_STEPS.indexOf(step);
  if (index < 0) throw new Error(`unknown revision step ${step}`);
  return index + 1;
}

function assertState(value: unknown, path: string): asserts value is RevisionState {
  if (value === null || typeof value !== "object") throw new Error(`revision state at ${path} is not an object`);
  const state = value as Partial<RevisionState>;
  if (state.version !== REVISION_STATE_VERSION) throw new Error(`revision state at ${path} has unsupported version`);
  if (typeof state.project_root !== "string" || state.project_root.length === 0) throw new Error(`revision state at ${path} has no project_root`);
  if (state.parent_route !== undefined && state.parent_route !== "reconstruction" && state.parent_route !== "description") throw new Error(`revision state at ${path} has invalid parent_route`);
  if (state.run !== undefined && typeof state.run !== "string") throw new Error(`revision state at ${path} has invalid run`);
  if (state.request !== undefined && typeof state.request !== "string") throw new Error(`revision state at ${path} has invalid request`);
  if (!REVISION_STEPS.length || typeof state.status !== "string" || !["active", "complete", "blocked"].includes(state.status)) throw new Error(`revision state at ${path} has invalid status`);
  if (typeof state.current_step !== "number" || !Number.isSafeInteger(state.current_step) || state.current_step < 1 || state.current_step > REVISION_STEPS.length + 1) throw new Error(`revision state at ${path} has invalid current_step`);
  if (!Array.isArray(state.completed_steps) || state.completed_steps.some((step) => !Number.isSafeInteger(step) || step < 1 || step > REVISION_STEPS.length)) throw new Error(`revision state at ${path} has invalid completed_steps`);
  if (state.in_progress !== null && (state.in_progress === undefined || typeof state.in_progress !== "object" || !Number.isSafeInteger(state.in_progress.step))) throw new Error(`revision state at ${path} has invalid in_progress`);
  if (state.artifacts === null || typeof state.artifacts !== "object" || Array.isArray(state.artifacts)) throw new Error(`revision state at ${path} has invalid artifacts`);
  if (!Array.isArray(state.decisions) || state.decisions.some((item) => typeof item !== "string")) throw new Error(`revision state at ${path} has invalid decisions`);
  if (state.impact !== undefined && (!Array.isArray(state.impact) || state.impact.some((item) => typeof item !== "string"))) throw new Error(`revision state at ${path} has invalid impact`);
  if (state.affected_source !== undefined && (!Array.isArray(state.affected_source) || state.affected_source.some((item) => typeof item !== "string"))) throw new Error(`revision state at ${path} has invalid affected_source`);
  if (typeof state.next_action !== "string" || typeof state.updated_at !== "string") throw new Error(`revision state at ${path} is missing recovery fields`);
}

async function writeRevisionState(state: RevisionState): Promise<RevisionState> {
  const path = revisionStatePath(state.project_root);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, path);
  return state;
}

export async function readRevisionState(projectRoot: string): Promise<RevisionState | undefined> {
  const path = revisionStatePath(projectRoot);
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (text === undefined) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) {
    throw new Error(`revision state at ${path} is invalid JSON; original file was preserved: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertState(parsed, path);
  return parsed;
}

export async function startRevisionState(input: RevisionStateInput): Promise<RevisionState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRevisionState(projectRoot);
  if (existing !== undefined && existing.status !== "complete") throw new Error(`project already has an active revision at ${revisionStatePath(projectRoot)}`);
  const parentPath = join(projectRoot, ".hypit", "route-state.json");
  const parentBytes = await readFile(parentPath).catch(() => undefined);
  const parentStateDigest = input.parentStateDigest ?? (parentBytes === undefined ? undefined : `sha256:${createHash("sha256").update(parentBytes).digest("hex")}`);
  let parentRoute = input.parentRoute;
  if (parentRoute === undefined && parentBytes !== undefined) {
    try {
      const parsed = JSON.parse(parentBytes.toString()) as { route?: unknown };
      if (parsed.route === "reconstruction" || parsed.route === "description") parentRoute = parsed.route;
    } catch { /* parent route remains explicit/unknown; recovery can still inspect the file */ }
  }
  const now = new Date().toISOString();
  return writeRevisionState({
    version: 1, project_root: projectRoot, status: "active", current_step: 1, completed_steps: [],
    in_progress: { step: 1, started_at: now }, artifacts: {}, decisions: [],
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(parentRoute === undefined ? {} : { parent_route: parentRoute }),
    ...(parentStateDigest === undefined ? {} : { parent_state_digest: parentStateDigest }),
    ...(input.request === undefined ? {} : { request: input.request }),
    next_action: `complete ${REVISION_STEPS[0]}`,
    updated_at: now,
  });
}

export async function checkpointRevisionState(input: RevisionCheckpointInput): Promise<RevisionState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRevisionState(projectRoot);
  if (existing === undefined) throw new Error(`no revision state at ${revisionStatePath(projectRoot)}; run revision_state start first`);
  const step = stepNumber(input.step);
  const completed = new Set(existing.completed_steps);
  if (input.status === "complete") completed.add(step);
  const completedSteps = [...completed].sort((a, b) => a - b);
  const next = input.status === "complete" ? nextUncompleted(completedSteps) : step;
  const now = new Date().toISOString();
  const artifacts = input.artifacts === undefined ? existing.artifacts : {
    ...existing.artifacts,
    ...Object.fromEntries(Object.entries(input.artifacts).map(([key, value]) => [key, resolve(projectRoot, value)])),
  };
  const decisions = input.decision === undefined || input.decision.trim().length === 0 || existing.decisions.includes(input.decision)
    ? existing.decisions : [...existing.decisions, input.decision.trim()];
  return writeRevisionState({
    ...existing,
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(input.parentRoute === undefined ? {} : { parent_route: input.parentRoute }),
    ...(input.parentStateDigest === undefined ? {} : { parent_state_digest: input.parentStateDigest }),
    ...(input.request === undefined ? {} : { request: input.request }),
    ...(input.impact === undefined ? {} : { impact: [...input.impact] }),
    ...(input.affectedSource === undefined ? {} : { affected_source: [...input.affectedSource] }),
    status: input.status === "blocked" ? "blocked" : next > REVISION_STEPS.length ? "complete" : "active",
    current_step: next,
    completed_steps: completedSteps,
    in_progress: input.status === "in_progress" ? { step, started_at: now } : input.status === "complete" ? (next > REVISION_STEPS.length ? null : { step: next, started_at: now }) : existing.in_progress,
    artifacts, decisions,
    next_action: input.nextAction?.trim() || (next > REVISION_STEPS.length ? "revision complete" : `complete ${REVISION_STEPS[next - 1]}`),
    ...(input.command === undefined ? {} : { last_command: input.command }),
    ...(input.error === undefined ? {} : { last_error: input.error }),
    updated_at: now,
  });
}

async function fileExists(path: string | undefined): Promise<boolean> {
  return path !== undefined && await stat(path).then((value) => value.isFile(), () => false);
}

/** Reconcile only machine-verifiable revision stages; creative mapping and review stay explicit. */
export async function reconcileRevisionState(projectRoot: string): Promise<RevisionState | undefined> {
  const existing = await readRevisionState(projectRoot);
  if (existing === undefined) return undefined;
  const completed = new Set(existing.completed_steps);
  const conflicts: string[] = [];
  const checks: Readonly<Record<number, string>> = {
    5: "gates_check", 6: "preview_render", 8: "final_check", 10: "build",
  };
  for (const [rawStep, key] of Object.entries(checks)) {
    const step = Number(rawStep);
    const present = await fileExists(existing.artifacts[key]);
    if (present) completed.add(step);
    else if (completed.has(step)) { completed.delete(step); conflicts.push(`step ${step} (${key}) was marked complete but its evidence is missing`); }
  }
  // A later machine artifact cannot silently credit the manual intent/source stages.
  const next = nextUncompleted([...completed]);
  const now = new Date().toISOString();
  const { conflicts: _old, ...base } = existing;
  return writeRevisionState({
    ...base,
    status: next > REVISION_STEPS.length ? "complete" : existing.status === "blocked" ? "blocked" : "active",
    current_step: next,
    completed_steps: [...completed].sort((a, b) => a - b),
    in_progress: next > REVISION_STEPS.length ? null : { step: next, started_at: now },
    next_action: next > REVISION_STEPS.length ? "revision complete" : `complete ${REVISION_STEPS[next - 1]}`,
    ...(conflicts.length === 0 ? {} : { conflicts }),
    updated_at: now,
  });
}

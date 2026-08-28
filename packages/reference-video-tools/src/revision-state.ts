import { readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { readRouteState, routeExecutionStatePath } from "./route-state.js";
import { atomicJson, digestPath, executionId, persistExecutionState } from "./state-files.js";

/** A durable, small snapshot for a post-completion natural-language revision. */
export type RevisionStatus = "active" | "complete" | "blocked";
export type RevisionParentRoute = "reconstruction" | "description" | "variant";
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

export const REVISION_STATE_VERSION = 2 as const;
export const REVISION_STEPS: readonly RevisionStep[] = [
  "request-captured", "impact-assessed", "intent-mapped", "source-updated", "gates-checked",
  "preview-rendered", "review-complete", "final-checked", "revision-complete", "build-complete",
];

// Revision is intentionally source-and-gate only.  A preview render or VLM
// review is never a prerequisite, and a paid Build is conditional on the
// impact of the change and a fresh user approval.
const REQUIRED_REVISION_STEPS = new Set<number>([1, 2, 3, 4, 5, 8, 9]);

export type RevisionState = {
  readonly version: 2;
  readonly revision_id: string;
  readonly project_root: string;
  readonly run?: string;
  readonly parent_route?: RevisionParentRoute;
  readonly parent_state_digest?: string;
  readonly parent_state_path?: string;
  readonly parent_revision_id?: string;
  readonly parent_revision_digest?: string;
  readonly parent_revision_path?: string;
  readonly intent_basis: string;
  readonly status: RevisionStatus;
  readonly current_step: number;
  readonly completed_steps: readonly number[];
  readonly in_progress: { readonly step: number; readonly started_at: string } | null;
  readonly request?: string;
  readonly impact?: readonly string[];
  readonly affected_source?: readonly string[];
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

export type RevisionStateInput = {
  readonly projectRoot: string;
  readonly run?: string;
  readonly parentRoute?: RevisionParentRoute;
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

export function revisionExecutionStatePath(projectRoot: string, revisionId: string): string {
  return join(resolve(projectRoot), ".hypit", "revisions", revisionId, "state.json");
}

export function revisionRequestPath(projectRoot: string, revisionId: string): string {
  return join(resolve(projectRoot), ".hypit", "revisions", revisionId, "request.json");
}

function nextUncompleted(completed: readonly number[]): number {
  const done = new Set(completed);
  for (let step = 1; step <= REVISION_STEPS.length; step += 1) {
    if (REQUIRED_REVISION_STEPS.has(step) && !done.has(step)) return step;
  }
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
  if (typeof state.revision_id !== "string" || state.revision_id.length === 0) throw new Error(`revision state at ${path} has no revision_id`);
  if (typeof state.project_root !== "string" || state.project_root.length === 0) throw new Error(`revision state at ${path} has no project_root`);
  if (state.parent_route !== undefined && state.parent_route !== "reconstruction" && state.parent_route !== "description" && state.parent_route !== "variant") throw new Error(`revision state at ${path} has invalid parent_route`);
  if (state.parent_revision_id !== undefined && typeof state.parent_revision_id !== "string") throw new Error(`revision state at ${path} has invalid parent_revision_id`);
  if (state.parent_revision_digest !== undefined && typeof state.parent_revision_digest !== "string") throw new Error(`revision state at ${path} has invalid parent_revision_digest`);
  if (state.parent_revision_path !== undefined && typeof state.parent_revision_path !== "string") throw new Error(`revision state at ${path} has invalid parent_revision_path`);
  if (state.run !== undefined && typeof state.run !== "string") throw new Error(`revision state at ${path} has invalid run`);
  if (state.request !== undefined && typeof state.request !== "string") throw new Error(`revision state at ${path} has invalid request`);
  if (!REVISION_STEPS.length || typeof state.status !== "string" || !["active", "complete", "blocked"].includes(state.status)) throw new Error(`revision state at ${path} has invalid status`);
  if (typeof state.current_step !== "number" || !Number.isSafeInteger(state.current_step) || state.current_step < 1 || state.current_step > REVISION_STEPS.length + 1) throw new Error(`revision state at ${path} has invalid current_step`);
  if (!Array.isArray(state.completed_steps) || state.completed_steps.some((step) => !Number.isSafeInteger(step) || step < 1 || step > REVISION_STEPS.length)) throw new Error(`revision state at ${path} has invalid completed_steps`);
  if (state.in_progress !== null && (state.in_progress === undefined || typeof state.in_progress !== "object" || !Number.isSafeInteger(state.in_progress.step))) throw new Error(`revision state at ${path} has invalid in_progress`);
  if (state.artifacts === null || typeof state.artifacts !== "object" || Array.isArray(state.artifacts)) throw new Error(`revision state at ${path} has invalid artifacts`);
  if (state.artifact_digests === null || typeof state.artifact_digests !== "object" || Array.isArray(state.artifact_digests)) throw new Error(`revision state at ${path} has invalid artifact_digests`);
  if (!Array.isArray(state.decisions) || state.decisions.some((item) => typeof item !== "string")) throw new Error(`revision state at ${path} has invalid decisions`);
  if (state.impact !== undefined && (!Array.isArray(state.impact) || state.impact.some((item) => typeof item !== "string"))) throw new Error(`revision state at ${path} has invalid impact`);
  if (state.affected_source !== undefined && (!Array.isArray(state.affected_source) || state.affected_source.some((item) => typeof item !== "string"))) throw new Error(`revision state at ${path} has invalid affected_source`);
  if (typeof state.intent_basis !== "string" || typeof state.next_action !== "string" || typeof state.created_at !== "string" || typeof state.updated_at !== "string") throw new Error(`revision state at ${path} is missing recovery fields`);
}

async function writeRevisionState(state: RevisionState): Promise<RevisionState> {
  await persistExecutionState(state.project_root, "revision-state.json", "revisions", state.revision_id, state);
  return state;
}

function migrateRevisionState(value: unknown): RevisionState | undefined {
  if (value === null || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return undefined;
  const previous = value as Omit<RevisionState, "version" | "revision_id" | "parent_state_path" | "intent_basis" | "artifact_digests" | "created_at"> & { readonly version: 1 };
  const createdAt = typeof previous.updated_at === "string" ? previous.updated_at : new Date().toISOString();
  return {
    ...previous,
    version: REVISION_STATE_VERSION,
    revision_id: executionId("revision"),
    intent_basis: previous.parent_state_digest === undefined ? "supplied-project" : "legacy-parent-route",
    artifact_digests: {},
    created_at: createdAt,
  };
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
  const migrated = migrateRevisionState(parsed);
  if (migrated !== undefined) {
    const requestPath = revisionRequestPath(migrated.project_root, migrated.revision_id);
    await atomicJson(requestPath, { revision_id: migrated.revision_id, request: migrated.request ?? null, intent_basis: migrated.intent_basis, migrated: true });
    const requestDigest = await digestPath(requestPath);
    const state = {
      ...migrated,
      artifacts: { ...migrated.artifacts, revision_request: requestPath },
      artifact_digests: requestDigest === undefined ? migrated.artifact_digests : { ...migrated.artifact_digests, revision_request: requestDigest },
    };
    await writeRevisionState(state);
    return state;
  }
  assertState(parsed, path);
  return parsed;
}

export async function startRevisionState(input: RevisionStateInput): Promise<RevisionState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRevisionState(projectRoot);
  if (existing !== undefined && existing.status !== "complete") throw new Error(`project already has an active revision at ${revisionStatePath(projectRoot)}`);
  const parentState = await readRouteState(projectRoot);
  const parentStatePath = parentState === undefined ? undefined : routeExecutionStatePath(projectRoot, parentState.route_id);
  const parentStateDigest = input.parentStateDigest ?? (parentStatePath === undefined ? undefined : await digestPath(parentStatePath));
  const parentRevisionPath = existing === undefined ? undefined : revisionExecutionStatePath(projectRoot, existing.revision_id);
  const parentRevisionDigest = parentRevisionPath === undefined ? undefined : await digestPath(parentRevisionPath);
  const parentRoute = input.parentRoute ?? (parentState?.route === "reconstruction" || parentState?.route === "description" || parentState?.route === "variant" ? parentState.route : undefined);
  const canonicalBrief = join(projectRoot, ".hypit", "brief.json");
  const briefExists = await stat(canonicalBrief).then((value) => value.isFile(), () => false);
  const intentBasis = parentRevisionPath ?? parentStatePath ?? (briefExists ? canonicalBrief : "supplied-project");
  const now = new Date().toISOString();
  const revisionId = executionId("revision");
  const requestPath = revisionRequestPath(projectRoot, revisionId);
  await atomicJson(requestPath, {
    revision_id: revisionId,
    request: input.request ?? null,
    intent_basis: intentBasis,
    ...(parentStatePath === undefined ? {} : { parent_state_path: parentStatePath }),
    ...(parentStateDigest === undefined ? {} : { parent_state_digest: parentStateDigest }),
    ...(existing === undefined ? {} : { parent_revision_id: existing.revision_id }),
    ...(parentRevisionPath === undefined ? {} : { parent_revision_path: parentRevisionPath }),
    ...(parentRevisionDigest === undefined ? {} : { parent_revision_digest: parentRevisionDigest }),
    captured_at: now,
  });
  const requestDigest = await digestPath(requestPath);
  return writeRevisionState({
    version: REVISION_STATE_VERSION, revision_id: revisionId, project_root: projectRoot, status: "active", current_step: 1, completed_steps: [],
    in_progress: { step: 1, started_at: now }, artifacts: { revision_request: requestPath },
    artifact_digests: requestDigest === undefined ? {} : { revision_request: requestDigest }, decisions: [],
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(parentRoute === undefined ? {} : { parent_route: parentRoute }),
    ...(parentStateDigest === undefined ? {} : { parent_state_digest: parentStateDigest }),
    ...(parentStatePath === undefined ? {} : { parent_state_path: parentStatePath }),
    ...(existing === undefined ? {} : { parent_revision_id: existing.revision_id }),
    ...(parentRevisionPath === undefined ? {} : { parent_revision_path: parentRevisionPath }),
    ...(parentRevisionDigest === undefined ? {} : { parent_revision_digest: parentRevisionDigest }),
    ...(input.request === undefined ? {} : { request: input.request }),
    intent_basis: intentBasis,
    next_action: `complete ${REVISION_STEPS[0]}`,
    created_at: now,
    updated_at: now,
  });
}

export async function checkpointRevisionState(input: RevisionCheckpointInput): Promise<RevisionState> {
  const projectRoot = resolve(input.projectRoot);
  const existing = await readRevisionState(projectRoot);
  if (existing === undefined) throw new Error(`no revision state at ${revisionStatePath(projectRoot)}; run revision_state start first`);
  if (input.request !== undefined && input.request !== existing.request) throw new Error("a revision request is immutable after revision_state start; start a new revision instead");
  const step = stepNumber(input.step);
  const artifacts = input.artifacts === undefined ? existing.artifacts : {
    ...existing.artifacts,
    ...Object.fromEntries(Object.entries(input.artifacts).map(([key, value]) => [key, resolve(projectRoot, value)])),
  };
  if (step === stepNumber("gates-checked") && input.status === "complete") {
    const layout = artifacts.layout_check;
    const value = layout === undefined ? undefined : await readFile(layout, "utf8").then((source) => JSON.parse(source) as { executed?: unknown; settled?: unknown }, () => undefined);
    if (value?.executed !== true || value.settled !== true || !(await layoutEvidenceCurrent(layout))) {
      throw new Error("gates-checked requires a successful layout_check whose candidates are repaired or explicitly accepted");
    }
  }
  const completed = new Set(existing.completed_steps);
  if (input.status === "complete") completed.add(step);
  const completedSteps = [...completed].sort((a, b) => a - b);
  const next = input.status === "complete" ? nextUncompleted(completedSteps) : step;
  const now = new Date().toISOString();
  const artifactDigests: Record<string, string> = { ...existing.artifact_digests };
  for (const [key, value] of Object.entries(artifacts)) {
    if (key !== "revision_request" && key !== "layout_check" && key !== "layout_decisions" && !value.includes(`${sep}.hypit${sep}evidence${sep}`)) continue;
    const digest = await digestPath(value);
    if (digest !== undefined) artifactDigests[key] = digest;
  }
  const decisions = input.decision === undefined || input.decision.trim().length === 0 || existing.decisions.includes(input.decision)
    ? existing.decisions : [...existing.decisions, input.decision.trim()];
  return writeRevisionState({
    ...existing,
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    ...(input.parentRoute === undefined ? {} : { parent_route: input.parentRoute }),
    ...(input.parentStateDigest === undefined ? {} : { parent_state_digest: input.parentStateDigest }),
    ...(input.impact === undefined ? {} : { impact: [...input.impact] }),
    ...(input.affectedSource === undefined ? {} : { affected_source: [...input.affectedSource] }),
    status: input.status === "blocked" ? "blocked" : next > REVISION_STEPS.length ? "complete" : "active",
    current_step: next,
    completed_steps: completedSteps,
    in_progress: input.status === "in_progress" ? { step, started_at: now } : input.status === "complete" ? (next > REVISION_STEPS.length ? null : { step: next, started_at: now }) : existing.in_progress,
    artifacts, artifact_digests: artifactDigests, decisions,
    next_action: input.nextAction?.trim() || (next > REVISION_STEPS.length ? "revision complete" : `complete ${REVISION_STEPS[next - 1]}`),
    ...(input.command === undefined ? {} : { last_command: input.command }),
    ...(input.error === undefined ? {} : { last_error: input.error }),
    updated_at: now,
  });
}

async function fileExists(path: string | undefined): Promise<boolean> {
  return path !== undefined && await stat(path).then((value) => value.isFile(), () => false);
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

/** Reconcile only machine-verifiable revision stages; creative mapping and review stay explicit. */
export async function reconcileRevisionState(projectRoot: string): Promise<RevisionState | undefined> {
  const existing = await readRevisionState(projectRoot);
  if (existing === undefined) return undefined;
  const completed = new Set(existing.completed_steps);
  const conflicts: string[] = [];
  for (const [key, expected] of Object.entries(existing.artifact_digests)) {
    const path = existing.artifacts[key];
    const actual = path === undefined ? undefined : await digestPath(path);
    if (actual !== expected) conflicts.push(`${key} digest changed: expected ${expected}, found ${actual ?? "missing"}`);
  }
  if (existing.parent_state_path !== undefined && existing.parent_state_digest !== undefined) {
    const actual = await digestPath(existing.parent_state_path);
    if (actual !== existing.parent_state_digest) conflicts.push(`parent route digest changed: expected ${existing.parent_state_digest}, found ${actual ?? "missing"}`);
  }
  if (existing.parent_revision_path !== undefined && existing.parent_revision_digest !== undefined) {
    const actual = await digestPath(existing.parent_revision_path);
    if (actual !== existing.parent_revision_digest) conflicts.push(`parent revision digest changed: expected ${existing.parent_revision_digest}, found ${actual ?? "missing"}`);
  }
  const checks: Readonly<Record<number, string>> = {
    1: "revision_request", 5: "gates_check", 6: "preview_render", 8: "final_check", 10: "build",
  };
  for (const [rawStep, key] of Object.entries(checks)) {
    const step = Number(rawStep);
    const present = await fileExists(existing.artifacts[key]);
    const layoutSatisfied = step !== 5 || existing.status === "complete" || await (async () => {
      const path = existing.artifacts.layout_check;
      if (path === undefined) return false;
      try {
        const value = JSON.parse(await readFile(path, "utf8")) as { executed?: unknown; settled?: unknown };
        return value.executed === true && value.settled === true && await layoutEvidenceCurrent(path);
      } catch { return false; }
    })();
    if (present && layoutSatisfied) completed.add(step);
    else if (completed.has(step)) { completed.delete(step); conflicts.push(`step ${step} (${key}) was marked complete but its evidence is missing`); }
  }
  // A later machine artifact cannot silently credit the manual intent/source stages.
  const next = nextUncompleted([...completed]);
  const now = new Date().toISOString();
  const { conflicts: _old, ...base } = existing;
  const state: RevisionState = {
    ...base,
    status: next > REVISION_STEPS.length ? "complete" : existing.status === "blocked" ? "blocked" : "active",
    current_step: next,
    completed_steps: [...completed].sort((a, b) => a - b),
    in_progress: next > REVISION_STEPS.length ? null : { step: next, started_at: now },
    next_action: next > REVISION_STEPS.length ? "revision complete" : `complete ${REVISION_STEPS[next - 1]}`,
    ...(conflicts.length === 0 ? {} : { conflicts }),
    updated_at: now,
  };
  const unchanged = state.status === existing.status
    && state.current_step === existing.current_step
    && JSON.stringify(state.completed_steps) === JSON.stringify(existing.completed_steps)
    && JSON.stringify(state.conflicts ?? []) === JSON.stringify(existing.conflicts ?? [])
    && state.next_action === existing.next_action;
  return unchanged ? existing : writeRevisionState(state);
}

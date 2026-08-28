import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { checkpointRouteState, readRouteState, reconcileRouteState, routeExecutionStatePath, routeStatePath } from "./route-state.js";
import { readRevisionState, revisionExecutionStatePath } from "./revision-state.js";
import { persistEvidence } from "./state-files.js";
import { inspectVariantDiff, snapshotProject } from "./variant-project.js";

export type VariantExpansionStatus = "active" | "complete" | "blocked";
export type VariantExpansionStep =
  | "baseline-validated" | "examples-inspected" | "format-plan-frozen" | "slate-drafted"
  | "vocabulary-enumerated" | "component-plan-frozen" | "package-gaps-classified"
  | "workload-disclosed" | "package-gaps-resolved" | "slate-frozen" | "projects-copied"
  | "variants-dispatched" | "variants-complete" | "aggregate-checked" | "build-planned"
  | "build-approved" | "build-complete" | "expansion-complete";

export const VARIANT_EXPANSION_STATE_VERSION = 1 as const;
export const VARIANT_EXPANSION_STEPS: readonly VariantExpansionStep[] = [
  "baseline-validated", "examples-inspected", "format-plan-frozen", "slate-drafted",
  "vocabulary-enumerated", "component-plan-frozen", "package-gaps-classified", "workload-disclosed",
  "package-gaps-resolved", "slate-frozen", "projects-copied", "variants-dispatched",
  "variants-complete", "aggregate-checked", "build-planned", "build-approved", "build-complete",
  "expansion-complete",
];

export type VariantWorkloadDisclosure = {
  readonly svml_only: number;
  readonly medium: number;
  readonly new_packages: number;
  readonly package_purposes?: readonly string[];
  readonly paid_generation: boolean;
  readonly disclosed_at: string;
};

export type VariantExpansionVariant = {
  readonly id: string;
  readonly slug: string;
  readonly project_root: string;
  readonly run: string;
  readonly route_state: string;
  readonly manifest: string;
  readonly brief: string;
  readonly format_plan?: string;
  readonly component_plan?: string;
  readonly allowed_changes: string;
  readonly allowed_change_paths: readonly string[];
  readonly component_class: "svml-only" | "existing-component" | "composed-components" | "new-package";
  readonly vocabulary_mode: "inherited" | "inspect";
  readonly vocabulary_packages: readonly string[];
  readonly vocabulary_digest?: string;
  readonly package_injections: readonly { readonly package_id: string; readonly destination: string; readonly digest: string }[];
  readonly status: "ready" | "dispatched" | "complete" | "failed" | "scope-expansion-required";
  readonly error?: string;
};

export type VariantExpansionPackage = {
  readonly id: string;
  readonly purpose: string;
  readonly staging_root: string;
  readonly package_root?: string;
  readonly route_state: string;
  readonly digest?: string;
  readonly status: "planned" | "active" | "ready" | "failed";
  readonly error?: string;
};

export type VariantExpansionState = {
  readonly version: 1;
  readonly batch_id: string;
  readonly project_root: string;
  readonly output_root: string;
  readonly run?: string;
  readonly baseline_digest: string;
  readonly parent_route?: "reconstruction" | "description";
  readonly parent_state_digest?: string;
  readonly parent_state_path?: string;
  readonly revision_state_digest?: string;
  readonly revision_state_path?: string;
  readonly request?: string;
  readonly count?: number;
  readonly delivery_mode: "source" | "build";
  readonly status: VariantExpansionStatus;
  readonly current_step: number;
  readonly completed_steps: readonly number[];
  readonly in_progress: { readonly step: number; readonly started_at: string } | null;
  readonly artifacts: Readonly<Record<string, string>>;
  readonly workload_disclosure?: VariantWorkloadDisclosure;
  readonly packages: readonly VariantExpansionPackage[];
  readonly variants: readonly VariantExpansionVariant[];
  readonly decisions: readonly string[];
  readonly conflicts: readonly string[];
  readonly next_action: string;
  readonly last_command?: string;
  readonly last_error?: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type VariantExpansionLocator = {
  readonly version: 1;
  readonly batch_id: string;
  readonly project_root: string;
  readonly output_root: string;
  readonly state_path: string;
  readonly baseline_digest: string;
  readonly status: VariantExpansionStatus;
  readonly updated_at: string;
};

export type StartVariantExpansionInput = {
  readonly projectRoot: string;
  readonly outputRoot: string;
  readonly run?: string;
  readonly request?: string;
  readonly count?: number;
  readonly deliveryMode?: "source" | "build";
  readonly parentRoute?: "reconstruction" | "description";
  readonly parentStateDigest?: string;
  readonly revisionStateDigest?: string;
};

export type VariantExpansionCheckpointInput = {
  readonly projectRoot: string;
  readonly outputRoot?: string;
  readonly batchId?: string;
  readonly step: number | VariantExpansionStep;
  readonly status?: "in_progress" | "complete" | "blocked";
  readonly nextAction?: string;
  readonly artifacts?: Readonly<Record<string, string>>;
  readonly workloadDisclosure?: VariantWorkloadDisclosure;
  readonly packages?: readonly VariantExpansionPackage[];
  readonly variants?: readonly VariantExpansionVariant[];
  readonly variantUpdates?: readonly VariantExpansionVariant[];
  readonly decision?: string;
  readonly conflict?: string;
  readonly resolveConflict?: string;
  readonly command?: string;
  readonly error?: string;
};

export function variantExpansionStatePath(outputRoot: string): string {
  return join(resolve(outputRoot), ".hypit", "variant-expansion-state.json");
}

export function variantExpansionLocatorPath(projectRoot: string, batchId: string): string {
  return join(resolve(projectRoot), ".hypit", "variant-expansions", `${batchId}.json`);
}

async function digestFile(path: string): Promise<string | undefined> {
  const bytes = await readFile(path).catch(() => undefined);
  return bytes === undefined ? undefined : `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function withStateLock<T>(outputRoot: string, work: () => Promise<T>): Promise<T> {
  const lockPath = join(resolve(outputRoot), ".hypit", "variant-expansion-state.lock");
  await mkdir(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 3_000; attempt += 1) {
    const handle = await open(lockPath, "wx").catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
      throw error;
    });
    if (handle !== undefined) {
      try {
        await handle.writeFile(`${process.pid}\n`, "utf8");
        return await work();
      } finally {
        await handle.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
      }
    }
    const stale = await stat(lockPath).then((value) => Date.now() - value.mtimeMs > 300_000, () => false);
    if (stale) await unlink(lockPath).catch(() => undefined);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(`timed out waiting for variant state lock at ${lockPath}`);
}

function assertLocator(value: unknown, path: string): asserts value is VariantExpansionLocator {
  if (value === null || typeof value !== "object") throw new Error(`variant locator at ${path} is not an object`);
  const locator = value as Partial<VariantExpansionLocator>;
  if (locator.version !== 1 || typeof locator.batch_id !== "string" || typeof locator.output_root !== "string" || typeof locator.state_path !== "string") {
    throw new Error(`variant locator at ${path} is invalid`);
  }
}

function assertState(value: unknown, path: string): asserts value is VariantExpansionState {
  if (value === null || typeof value !== "object") throw new Error(`variant expansion state at ${path} is not an object`);
  const state = value as Partial<VariantExpansionState>;
  if (state.version !== 1) throw new Error(`variant expansion state at ${path} has unsupported version`);
  if (typeof state.batch_id !== "string" || typeof state.project_root !== "string" || typeof state.output_root !== "string") throw new Error(`variant expansion state at ${path} has invalid roots`);
  if (typeof state.baseline_digest !== "string" || (state.delivery_mode !== "source" && state.delivery_mode !== "build")) throw new Error(`variant expansion state at ${path} has invalid baseline metadata`);
  if (state.status !== "active" && state.status !== "complete" && state.status !== "blocked") throw new Error(`variant expansion state at ${path} has invalid status`);
  if (!Number.isSafeInteger(state.current_step) || state.current_step! < 1 || state.current_step! > VARIANT_EXPANSION_STEPS.length + 1) throw new Error(`variant expansion state at ${path} has invalid current_step`);
  if (!Array.isArray(state.completed_steps) || state.completed_steps.some((step) => !Number.isSafeInteger(step) || step < 1 || step > VARIANT_EXPANSION_STEPS.length)) throw new Error(`variant expansion state at ${path} has invalid completed_steps`);
  if (state.artifacts === null || typeof state.artifacts !== "object" || Array.isArray(state.artifacts)) throw new Error(`variant expansion state at ${path} has invalid artifacts`);
  if (!Array.isArray(state.packages) || !Array.isArray(state.variants) || !Array.isArray(state.decisions) || !Array.isArray(state.conflicts)) throw new Error(`variant expansion state at ${path} has invalid collections`);
  if (typeof state.next_action !== "string" || typeof state.created_at !== "string" || typeof state.updated_at !== "string") throw new Error(`variant expansion state at ${path} is missing recovery fields`);
}

async function readJsonPreserving(path: string, subject: string): Promise<unknown | undefined> {
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (text === undefined) return undefined;
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${subject} at ${path} is invalid JSON; original file was preserved: ${error instanceof Error ? error.message : String(error)}`); }
}

async function writeLocator(state: VariantExpansionState): Promise<void> {
  const locator: VariantExpansionLocator = {
    version: 1, batch_id: state.batch_id, project_root: state.project_root, output_root: state.output_root,
    state_path: variantExpansionStatePath(state.output_root), baseline_digest: state.baseline_digest,
    status: state.status, updated_at: state.updated_at,
  };
  await atomicJson(variantExpansionLocatorPath(state.project_root, state.batch_id), locator);
}

async function writeState(state: VariantExpansionState): Promise<VariantExpansionState> {
  await atomicJson(variantExpansionStatePath(state.output_root), state);
  await writeLocator(state);
  return state;
}

export async function discoverVariantExpansions(projectRoot: string): Promise<readonly VariantExpansionLocator[]> {
  const root = join(resolve(projectRoot), ".hypit", "variant-expansions");
  const files = await import("node:fs/promises").then(({ readdir }) => readdir(root)).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  const locators: VariantExpansionLocator[] = [];
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    const path = join(root, file);
    const value = await readJsonPreserving(path, "variant locator");
    assertLocator(value, path);
    locators.push(value);
  }
  return locators.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

async function selectedLocator(projectRoot: string, outputRoot?: string, batchId?: string): Promise<VariantExpansionLocator | undefined> {
  if (outputRoot !== undefined) {
    const path = variantExpansionStatePath(outputRoot);
    const state = await readJsonPreserving(path, "variant expansion state");
    if (state === undefined) return undefined;
    assertState(state, path);
    if (resolve(state.project_root) !== resolve(projectRoot)) throw new Error(`${path} belongs to ${state.project_root}, not ${resolve(projectRoot)}`);
    return {
      version: 1, batch_id: state.batch_id, project_root: state.project_root, output_root: state.output_root,
      state_path: path, baseline_digest: state.baseline_digest, status: state.status, updated_at: state.updated_at,
    };
  }
  const locators = await discoverVariantExpansions(projectRoot);
  if (batchId !== undefined) return locators.find((item) => item.batch_id === batchId);
  return locators.find((item) => item.status !== "complete") ?? locators[0];
}

export async function readVariantExpansionState(projectRoot: string, outputRoot?: string, batchId?: string): Promise<VariantExpansionState | undefined> {
  const locator = await selectedLocator(projectRoot, outputRoot, batchId);
  if (locator === undefined) return undefined;
  const value = await readJsonPreserving(locator.state_path, "variant expansion state");
  if (value === undefined) throw new Error(`variant locator ${variantExpansionLocatorPath(projectRoot, locator.batch_id)} points to missing state ${locator.state_path}`);
  assertState(value, locator.state_path);
  if (resolve(value.project_root) !== resolve(projectRoot)) throw new Error(`${locator.state_path} belongs to ${value.project_root}, not ${resolve(projectRoot)}`);
  return value;
}

function nextUncompleted(completed: ReadonlySet<number>, deliveryMode: "source" | "build"): number {
  const optional = deliveryMode === "source" ? new Set([15, 16, 17]) : new Set<number>();
  for (let step = 1; step <= VARIANT_EXPANSION_STEPS.length; step += 1) {
    if (!optional.has(step) && !completed.has(step)) return step;
  }
  return VARIANT_EXPANSION_STEPS.length + 1;
}

function stepNumber(step: number | VariantExpansionStep): number {
  if (typeof step === "number") {
    if (!Number.isSafeInteger(step) || step < 1 || step > VARIANT_EXPANSION_STEPS.length) throw new Error(`variant expansion step ${step} is outside the route`);
    return step;
  }
  const index = VARIANT_EXPANSION_STEPS.indexOf(step);
  if (index < 0) throw new Error(`unknown variant expansion step ${step}`);
  return index + 1;
}

function requiredPriorSteps(step: number, deliveryMode: "source" | "build"): readonly number[] {
  const optional = deliveryMode === "source" ? new Set([15, 16, 17]) : new Set<number>();
  return Array.from({ length: step - 1 }, (_, index) => index + 1).filter((candidate) => !optional.has(candidate));
}

async function startVariantExpansionUnlocked(input: StartVariantExpansionInput): Promise<VariantExpansionState> {
  const projectRoot = resolve(input.projectRoot);
  const outputRoot = resolve(input.outputRoot);
  const outputRelative = relative(projectRoot, outputRoot);
  if (outputRelative.length === 0 || (!outputRelative.startsWith(`..${sep}`) && outputRelative !== ".." && !isAbsolute(outputRelative))) {
    throw new Error("variant output root must not be inside the base project");
  }
  const batchId = basename(outputRoot);
  if (batchId.length === 0 || batchId === "." || batchId === "..") throw new Error("variant output root must end in a batch id");
  if (input.count !== undefined && (!Number.isSafeInteger(input.count) || input.count < 1)) throw new Error("variant count must be a positive integer");
  const existing = await readVariantExpansionState(projectRoot, outputRoot);
  if (existing !== undefined) return existing;
  const locatorAtId = await readJsonPreserving(variantExpansionLocatorPath(projectRoot, batchId), "variant locator");
  if (locatorAtId !== undefined) {
    assertLocator(locatorAtId, variantExpansionLocatorPath(projectRoot, batchId));
    if (resolve(locatorAtId.output_root) !== outputRoot) throw new Error(`batch id ${batchId} already points to ${locatorAtId.output_root}`);
  }
  const baseline = await snapshotProject(projectRoot);
  const parentState = await readRouteState(projectRoot);
  const revisionState = await readRevisionState(projectRoot);
  const parentStatePath = parentState === undefined ? undefined : routeExecutionStatePath(projectRoot, parentState.route_id);
  const revisionStatePath = revisionState === undefined ? undefined : revisionExecutionStatePath(projectRoot, revisionState.revision_id);
  const parentStateBytes = parentStatePath === undefined ? undefined : await readFile(parentStatePath).catch(() => undefined);
  const parentStateDigest = input.parentStateDigest
    ?? (parentStateBytes === undefined ? undefined : `sha256:${createHash("sha256").update(parentStateBytes).digest("hex")}`);
  const revisionStateDigest = input.revisionStateDigest ?? (revisionStatePath === undefined ? undefined : await digestFile(revisionStatePath));
  let parentRoute = input.parentRoute;
  if (parentRoute === undefined && parentStateBytes !== undefined) {
    try {
      const parsed = JSON.parse(parentStateBytes.toString()) as { route?: unknown };
      if (parsed.route === "reconstruction" || parsed.route === "description") parentRoute = parsed.route;
    } catch { /* corrupt parent state is reported by reconcile rather than hidden here */ }
  }
  const now = new Date().toISOString();
  return writeState({
    version: 1, batch_id: batchId, project_root: projectRoot, output_root: outputRoot,
    ...(input.run === undefined ? {} : { run: resolve(projectRoot, input.run) }),
    baseline_digest: baseline.digest,
    ...(parentRoute === undefined ? {} : { parent_route: parentRoute }),
    ...(parentStateDigest === undefined ? {} : { parent_state_digest: parentStateDigest }),
    ...(parentStatePath === undefined ? {} : { parent_state_path: parentStatePath }),
    ...(revisionStateDigest === undefined ? {} : { revision_state_digest: revisionStateDigest }),
    ...(revisionStatePath === undefined ? {} : { revision_state_path: revisionStatePath }),
    ...(input.request === undefined ? {} : { request: input.request }),
    ...(input.count === undefined ? {} : { count: input.count }),
    delivery_mode: input.deliveryMode ?? "source", status: "active", current_step: 1, completed_steps: [],
    in_progress: { step: 1, started_at: now }, artifacts: {}, packages: [], variants: [], decisions: [], conflicts: [],
    next_action: `complete ${VARIANT_EXPANSION_STEPS[0]}`, created_at: now, updated_at: now,
  });
}

export async function startVariantExpansion(input: StartVariantExpansionInput): Promise<VariantExpansionState> {
  const projectRoot = resolve(input.projectRoot);
  const outputRoot = resolve(input.outputRoot);
  const outputRelative = relative(projectRoot, outputRoot);
  if (outputRelative.length === 0 || (!outputRelative.startsWith(`..${sep}`) && outputRelative !== ".." && !isAbsolute(outputRelative))) {
    throw new Error("variant output root must not be inside the base project");
  }
  return withStateLock(outputRoot, async () => startVariantExpansionUnlocked(input));
}

async function checkpointVariantExpansionUnlocked(input: VariantExpansionCheckpointInput): Promise<VariantExpansionState> {
  const existing = await readVariantExpansionState(input.projectRoot, input.outputRoot, input.batchId);
  if (existing === undefined) throw new Error("no variant expansion state; run variant_state --action start first");
  const step = stepNumber(input.step);
  const status = input.status ?? "complete";
  const completed = new Set(existing.completed_steps);
  if (status === "complete" && typeof input.step === "string") {
    const missing = requiredPriorSteps(step, existing.delivery_mode).filter((candidate) => !completed.has(candidate));
    if (missing.length > 0) throw new Error(`cannot complete ${VARIANT_EXPANSION_STEPS[step - 1]} before ${missing.map((candidate) => VARIANT_EXPANSION_STEPS[candidate - 1]).join(", ")}`);
  }
  if (status === "complete" && step === 8 && input.workloadDisclosure === undefined && existing.workload_disclosure === undefined) {
    throw new Error("workload-disclosed requires a persisted workload_disclosure");
  }
  if (input.workloadDisclosure !== undefined && existing.count !== undefined
    && input.workloadDisclosure.svml_only + input.workloadDisclosure.medium !== existing.count) {
    throw new Error(`workload disclosure accounts for ${input.workloadDisclosure.svml_only + input.workloadDisclosure.medium} variants, expected ${existing.count}`);
  }
  if (status === "complete") completed.add(step);
  const next = status === "complete" ? nextUncompleted(completed, existing.delivery_mode) : step;
  const now = new Date().toISOString();
  const artifacts = input.artifacts === undefined ? existing.artifacts : {
    ...existing.artifacts,
    ...Object.fromEntries(Object.entries(input.artifacts).map(([key, value]) => [key, resolve(existing.project_root, value)])),
  };
  const decisions = input.decision === undefined || input.decision.trim().length === 0 || existing.decisions.includes(input.decision.trim())
    ? existing.decisions : [...existing.decisions, input.decision.trim()];
  const resolved = input.resolveConflict?.trim();
  const retainedConflicts = resolved === undefined || resolved.length === 0
    ? existing.conflicts : existing.conflicts.filter((message) => message !== resolved);
  const conflicts = input.conflict === undefined || input.conflict.trim().length === 0 || retainedConflicts.includes(input.conflict.trim())
    ? retainedConflicts : [...retainedConflicts, input.conflict.trim()];
  if (input.packages !== undefined) {
    const packageIds = input.packages.map((pack) => pack.id);
    if (packageIds.some((id) => id.trim().length === 0) || new Set(packageIds).size !== packageIds.length) {
      throw new Error("variant packages require distinct non-empty ids");
    }
  }
  const packages: VariantExpansionPackage[] | undefined = input.packages === undefined ? undefined : await Promise.all(input.packages.map(async (pack) => {
    if (pack.status !== "ready") return pack;
    const route = await readRouteState(pack.staging_root);
    if (route?.route !== "variant-package") throw new Error(`package ${pack.id} has no variant-package route at ${pack.staging_root}`);
    const stagingRoot = resolve(pack.staging_root);
    const packageRoot = resolve(pack.package_root ?? pack.staging_root);
    const packageRelative = relative(stagingRoot, packageRoot);
    if (packageRelative === ".." || packageRelative.startsWith(`..${sep}`) || isAbsolute(packageRelative)) {
      throw new Error(`package ${pack.id} package_root must stay inside its staging project`);
    }
    const digest = (await snapshotProject(packageRoot, { preserveTopLevelOutputs: true })).digest;
    const evidence = await persistEvidence(pack.staging_root, "package-digest.json", { package_id: pack.id, staging_root: stagingRoot, package_root: packageRoot, digest, frozen_at: now });
    await checkpointRouteState({ projectRoot: pack.staging_root, route: "variant-package", step: "package-ready", status: "complete", artifacts: { package_digest: evidence } });
    return { ...pack, staging_root: stagingRoot, package_root: packageRoot, route_state: routeStatePath(pack.staging_root), digest };
  }));
  const variants = input.variantUpdates === undefined
    ? input.variants
    : existing.variants.map((variant) => input.variantUpdates!.find((update) => update.id === variant.id) ?? variant);
  return writeState({
    ...existing,
    status: status === "blocked" ? "blocked" : next > VARIANT_EXPANSION_STEPS.length ? "complete" : "active",
    current_step: next, completed_steps: [...completed].sort((a, b) => a - b),
    in_progress: next > VARIANT_EXPANSION_STEPS.length ? null : { step: next, started_at: now },
    artifacts, decisions, conflicts,
    ...(input.workloadDisclosure === undefined ? {} : { workload_disclosure: input.workloadDisclosure }),
    ...(packages === undefined ? {} : { packages }),
    ...(variants === undefined ? {} : { variants }),
    next_action: input.nextAction?.trim() || (next > VARIANT_EXPANSION_STEPS.length ? "variant expansion complete" : `complete ${VARIANT_EXPANSION_STEPS[next - 1]}`),
    ...(input.command === undefined ? {} : { last_command: input.command }),
    ...(input.error === undefined ? {} : { last_error: input.error }),
    updated_at: now,
  });
}

export async function checkpointVariantExpansion(input: VariantExpansionCheckpointInput): Promise<VariantExpansionState> {
  const locator = await selectedLocator(input.projectRoot, input.outputRoot, input.batchId);
  if (locator === undefined) throw new Error("no variant expansion state; run variant_state --action start first");
  return withStateLock(locator.output_root, async () => checkpointVariantExpansionUnlocked({ ...input, outputRoot: locator.output_root }));
}

async function exists(path: string | undefined): Promise<boolean> {
  return path !== undefined && await stat(path).then(() => true, () => false);
}

async function validJson(path: string | undefined, predicate: (value: unknown) => boolean = () => true): Promise<boolean> {
  if (!(await exists(path)) || path === undefined) return false;
  try { return predicate(JSON.parse(await readFile(path, "utf8"))); }
  catch { return false; }
}

async function reconcileVariantExpansionUnlocked(projectRoot: string, outputRoot?: string, batchId?: string): Promise<VariantExpansionState | undefined> {
  const existing = await readVariantExpansionState(projectRoot, outputRoot, batchId);
  if (existing === undefined) return undefined;
  const completed = new Set(existing.completed_steps);
  const conflicts = existing.conflicts.filter((message) => !message.startsWith("[reconcile] "));
  const addConflict = (message: string): void => { if (!conflicts.includes(message)) conflicts.push(message); };
  const baseline = await snapshotProject(existing.project_root);
  if (baseline.digest !== existing.baseline_digest) addConflict(`[reconcile] base project digest changed: expected ${existing.baseline_digest}, found ${baseline.digest}`);
  const parentDigest = await digestFile(existing.parent_state_path ?? join(existing.project_root, ".hypit", "route-state.json"));
  if (existing.parent_state_digest !== undefined && parentDigest !== existing.parent_state_digest) addConflict(`[reconcile] parent route state digest changed: expected ${existing.parent_state_digest}, found ${parentDigest ?? "missing"}`);
  const revisionDigest = await digestFile(existing.revision_state_path ?? join(existing.project_root, ".hypit", "revision-state.json"));
  if (existing.revision_state_digest !== undefined && revisionDigest !== existing.revision_state_digest) addConflict(`[reconcile] revision state digest changed: expected ${existing.revision_state_digest}, found ${revisionDigest ?? "missing"}`);

  const packages: VariantExpansionPackage[] = [];
  for (const pack of existing.packages) {
    const route = await reconcileRouteState(pack.staging_root);
    const currentDigest = await snapshotProject(pack.package_root ?? pack.staging_root, { preserveTopLevelOutputs: true }).then((snapshot) => snapshot.digest, () => undefined);
    if (pack.digest !== undefined && currentDigest !== pack.digest) {
      addConflict(`[reconcile] package ${pack.id} digest changed: expected ${pack.digest}, found ${currentDigest ?? "missing"}`);
    }
    const { error: _oldError, ...packWithoutError } = pack;
    packages.push({ ...packWithoutError, status: route?.status === "complete" && pack.digest !== undefined && currentDigest === pack.digest ? "ready" : route?.status === "blocked" ? "failed" : "active",
      ...(route === undefined ? { error: "route-state-missing" } : {}) });
  }

  const variants: VariantExpansionVariant[] = [];
  for (const variant of existing.variants) {
    const route = await reconcileRouteState(variant.project_root);
    const diff = await inspectVariantDiff(variant.project_root);
    const outside = Array.isArray(diff.outside_allowed_changes) ? diff.outside_allowed_changes : [];
    if (outside.length > 0) addConflict(`[reconcile] variant ${variant.id} changed outside allowed_changes: ${outside.join(", ")}`);
    if (diff.passed !== true && outside.length === 0) {
      const errors = Array.isArray(diff.errors) ? diff.errors.map(String).join(", ") : "variant baseline evidence failed";
      addConflict(`[reconcile] variant ${variant.id} scope evidence is invalid: ${errors}`);
    }
    const check = await validJson(route?.artifacts.variant_check ?? join(variant.project_root, ".hypit", "variant-check.json"), (value) => (value as { passed?: unknown })?.passed === true);
    const { error: _oldError, ...variantWithoutError } = variant;
    variants.push({
      ...variantWithoutError,
      status: outside.length > 0 ? "scope-expansion-required"
        : route?.status === "complete" && check ? "complete"
          : route?.status === "blocked" ? "failed" : route === undefined ? "failed" : variant.status === "ready" ? "ready" : "dispatched",
      ...(route === undefined ? { error: "route-state-missing" } : {}),
    });
  }

  const artifact = (key: string): string | undefined => existing.artifacts[key];
  const predicates = new Map<number, () => Promise<boolean>>([
    [1, async () => await validJson(artifact("baseline_check"), (value) => (value as { passed?: unknown })?.passed === true)
      || (await readRouteState(existing.project_root))?.status === "complete"],
    [2, async () => await validJson(artifact("examples"))],
    [3, async () => await validJson(artifact("format_plan"))],
    [4, async () => await validJson(artifact("slate"), (value) => Array.isArray((value as { variants?: unknown })?.variants))],
    [5, async () => await validJson(artifact("vocabulary"), (value) => Array.isArray((value as { packages?: unknown })?.packages) || Array.isArray((value as { surfaces?: unknown })?.surfaces))],
    [6, async () => await validJson(artifact("component_plan"))],
    [7, async () => await validJson(artifact("package_gaps"))],
    [9, async () => {
      const slatePath = artifact("slate");
      if (slatePath === undefined) return false;
      let slate: { variants?: readonly { component_class?: unknown; inject_packages?: readonly { package_id?: unknown }[] }[] };
      try { slate = JSON.parse(await readFile(slatePath, "utf8")) as typeof slate; } catch { return false; }
      const variantsInSlate = slate.variants ?? [];
      if (variantsInSlate.some((variant) => variant.component_class === "new-package" && (variant.inject_packages?.length ?? 0) === 0)) return false;
      const required = new Set(variantsInSlate.flatMap((variant) => variant.component_class === "new-package"
        ? (variant.inject_packages ?? []).flatMap((injection) => typeof injection.package_id === "string" ? [injection.package_id] : [])
        : []));
      return packages.every((pack) => pack.status === "ready")
        && [...required].every((id) => packages.some((pack) => pack.id === id && pack.status === "ready" && pack.digest !== undefined));
    }],
    [10, async () => await validJson(artifact("slate"), (value) => {
      const variants = (value as { variants?: unknown[] })?.variants;
      return Array.isArray(variants) && (existing.count === undefined || variants.length === existing.count);
    })],
    [11, async () => variants.length > 0 && (await Promise.all(variants.map(async (variant) => await exists(variant.manifest) && await exists(variant.project_root)))).every(Boolean)],
    [12, async () => variants.length > 0 && (await Promise.all(variants.map(async (variant) => await exists(variant.route_state)))).every(Boolean)],
    [13, async () => variants.length > 0 && variants.every((variant) => variant.status === "complete")],
    [14, async () => await validJson(artifact("aggregate_check"), (value) => (value as { passed?: unknown })?.passed === true)],
    [17, async () => completed.has(16) && await validJson(artifact("build"), (value) => (value as { passed?: unknown; status?: unknown })?.passed === true || (value as { status?: unknown })?.status === "complete")],
    [18, async () => completed.has(14) && (existing.delivery_mode === "source" || completed.has(17))],
  ]);
  const machineSteps = new Set([1, 9, 11, 13, 14, 17, 18]);
  for (const [step, predicate] of predicates) {
    const satisfied = await predicate();
    if (completed.has(step) && !satisfied) {
      completed.delete(step);
      addConflict(`[reconcile] step ${step} (${VARIANT_EXPANSION_STEPS[step - 1]}) was marked complete but its evidence is missing or failed`);
    } else if (machineSteps.has(step) && satisfied) completed.add(step);
  }
  if (existing.workload_disclosure === undefined && completed.has(8)) {
    completed.delete(8);
    addConflict("[reconcile] workload-disclosed was marked complete without a persisted disclosure");
  }
  if (conflicts.length > 0) {
    completed.delete(18);
  }
  const next = nextUncompleted(completed, existing.delivery_mode);
  const now = new Date().toISOString();
  return writeState({
    ...existing,
    status: next > VARIANT_EXPANSION_STEPS.length ? "complete" : existing.status === "blocked" ? "blocked" : "active",
    current_step: next, completed_steps: [...completed].sort((a, b) => a - b),
    in_progress: next > VARIANT_EXPANSION_STEPS.length ? null : { step: next, started_at: now },
    conflicts, packages, variants,
    next_action: next > VARIANT_EXPANSION_STEPS.length ? "variant expansion complete" : `complete ${VARIANT_EXPANSION_STEPS[next - 1]}`,
    updated_at: now,
  });
}

export async function reconcileVariantExpansion(projectRoot: string, outputRoot?: string, batchId?: string): Promise<VariantExpansionState | undefined> {
  const locator = await selectedLocator(projectRoot, outputRoot, batchId);
  if (locator === undefined) return undefined;
  return withStateLock(locator.output_root, async () => reconcileVariantExpansionUnlocked(projectRoot, locator.output_root, locator.batch_id));
}

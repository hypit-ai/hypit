import type { BuildResultManifest } from "@hypit/build-result";

import type { CliBuildSubmission, CliBuildView, CliRuntimeControl, CliRuntimeController } from "./runtime-port.js";
import { formatOperationProgress } from "./runtime-view.js";

const FIRST_HEARTBEAT_MS = 30_000;
const LATER_HEARTBEAT_MS = 60_000;
const MIN_PROGRESS_INTERVAL_MS = 1_000;

export type BuildProgressView = {
  readonly build: string;
  readonly state: "submitting" | "working" | "saving-result";
  readonly requests?: { readonly total: number; readonly completed: number };
  readonly phases: Readonly<Record<string, number>>;
  readonly elapsedMs: number;
  readonly details: readonly string[];
};

function progressPhases(view: CliBuildView): Readonly<Record<string, number>> {
  const phases = new Map<string, number>();
  for (const operation of view.operations.filter((item) => item.status === "pending")) {
    const phase = operation.progress?.phase ?? "in progress";
    phases.set(phase, (phases.get(phase) ?? 0) + 1);
  }
  return Object.fromEntries([...phases].sort(([left], [right]) => left.localeCompare(right)));
}

function progressState(view: CliBuildView): BuildProgressView["state"] {
  if (view.activity === "submitting") return "submitting";
  if (view.activity === "saving-result") return "saving-result";
  // `ready`, `running` and `waiting` describe short Worker scheduling turns, not three stages of a
  // video. They deliberately collapse into one stable product state.
  return "working";
}

export function buildProgressView(view: CliBuildView, now = Date.now()): BuildProgressView {
  return {
    build: view.id,
    state: progressState(view),
    ...(view.requests === undefined ? {} : { requests: view.requests }),
    phases: progressPhases(view),
    elapsedMs: Math.max(0, now - view.createdAt),
    details: [
      ...(view.stop === undefined ? [] : [view.stop.cause === "execution-failed"
        ? `Build stopping after failure${view.stop.reason === undefined ? "" : `: ${view.stop.reason}`}`
        : `Build cancelling${view.stop.reason === undefined ? "" : `: ${view.stop.reason}`}`]),
      ...view.operations.filter((item) => item.status === "pending")
      .map((item) => `${item.endpoint}: ${item.progress === undefined
        ? item.status
        : formatOperationProgress(item.progress)}`),
    ],
  };
}

/** Stable product-state projection for watch output and polling backoff. */
export function buildObservationKey(view: CliBuildView): string {
  return JSON.stringify({
    state: progressState(view),
    outcome: view.outcome,
    issue: view.issue,
    cancellationRequested: view.cancellationRequested,
    stop: view.stop,
    requests: view.requests,
    phases: progressPhases(view),
  });
}

/**
 * Stable Runtime activity projection. Capacity reservations are intentionally absent: they are
 * short implementation leases and can appear and disappear while no Build makes progress.
 */
export function activityObservationKey(
  worker: string,
  builds: readonly CliBuildView[],
): string {
  return JSON.stringify({
    worker,
    builds: [...builds]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((view) => [view.id, buildObservationKey(view)]),
  });
}

export function buildProgressLines(
  progress: BuildProgressView,
  options: { readonly verbose: boolean; readonly limit: number },
): readonly string[] {
  const state = {
    submitting: "Submitting",
    working: "Working",
    "saving-result": "Saving Result",
  }[progress.state];
  const requestProgress = progress.requests === undefined || progress.requests.total === 0
    ? []
    : [`${progress.requests.completed}/${progress.requests.total} steps complete`];
  const phases = Object.entries(progress.phases).map(([phase, count]) => `${count} ${phase}`);
  const seconds = Math.floor(progress.elapsedMs / 1_000);
  const elapsed = seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  return [
    `  · ${[state, ...requestProgress, ...phases, elapsed].join(" · ")}`,
    ...(options.verbose ? progress.details.slice(0, options.limit).map((line) => `    ${line}`) : []),
  ];
}

/**
 * Follow one accepted active Build until it finishes, needs attention or reaches the caller's wait
 * bound. Runtime polling stays responsive; progress callbacks observe only the stable product view.
 */
export async function observeBuildView(
  runtime: Pick<CliRuntimeControl, "inspect">,
  build: string,
  initial: CliBuildView,
  options: {
    readonly maxWaitMs?: number;
    readonly controller?: CliRuntimeController;
    readonly onProgress?: (value: BuildProgressView) => void;
  } = {},
): Promise<CliBuildView | undefined> {
  let view: CliBuildView | undefined = initial;
  let observedProgress: string | undefined;
  let pendingProgress = false;
  let lastProgressAt: number | undefined;
  let pollDelayMs = 100;
  let observed = false;
  const startedAt = Date.now();
  let nextHeartbeatAt = startedAt + FIRST_HEARTBEAT_MS;
  while (view !== undefined && view.issue === undefined) {
    const nextProgress = buildObservationKey(view);
    const now = Date.now();
    if (nextProgress !== observedProgress) {
      observedProgress = nextProgress;
      pendingProgress = true;
      pollDelayMs = 100;
    } else {
      pollDelayMs = Math.min(1_000, pollDelayMs * 2);
    }
    const heartbeatDue = now >= nextHeartbeatAt;
    const progressDue = pendingProgress
      && (lastProgressAt === undefined || now - lastProgressAt >= MIN_PROGRESS_INTERVAL_MS);
    if (progressDue || heartbeatDue) {
      options.onProgress?.(buildProgressView(view, now));
      lastProgressAt = now;
      nextHeartbeatAt = now + (pendingProgress ? FIRST_HEARTBEAT_MS : LATER_HEARTBEAT_MS);
      pendingProgress = false;
    }
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = options.maxWaitMs === undefined ? undefined : options.maxWaitMs - elapsedMs;
    if (remainingMs !== undefined && remainingMs <= 0) break;
    if (options.controller !== undefined) {
      const worker = await options.controller.worker.status();
      if (worker.state !== "running") {
        throw new Error(
          `Runtime Worker is ${worker.state}; Build ${build} remains durable. `
          + `Run hypit runtime up, then run hypit status ${build} --watch again`,
        );
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait,
      remainingMs === undefined ? pollDelayMs : Math.min(pollDelayMs, remainingMs)));
    view = await runtime.inspect(build);
    observed = true;
  }
  if (observed && view !== undefined && options.maxWaitMs !== undefined
    && Date.now() - startedAt >= options.maxWaitMs) {
    view = await runtime.inspect(build);
  }
  return view;
}

/** Observe one submitted Build. This reads accepted state only and never performs execution work. */
export async function observeBuild(
  runtime: Pick<CliRuntimeControl, "inspect">,
  initial: CliBuildSubmission,
  options: {
    readonly maxWaitMs?: number;
    readonly controller?: CliRuntimeController;
    readonly readResult: () => Promise<BuildResultManifest | undefined>;
    readonly onProgress?: (value: BuildProgressView) => void;
  },
): Promise<CliBuildSubmission> {
  const finishFromResult = async (): Promise<CliBuildSubmission> => {
    const result = await options.readResult();
    if (result?.outcome === undefined) {
      throw new Error(`Build ${initial.id} left active Runtime state without a finished Result`);
    }
    return {
      id: initial.id,
      state: initial.state,
      completion: {
        build: initial.id,
        outcome: result.outcome,
        ...(result.failure === undefined ? {} : { reason: result.failure }),
      },
    };
  };
  if (!("view" in initial)) return initial;
  const view = await observeBuildView(runtime, initial.id, initial.view, options);
  return view === undefined
    ? await finishFromResult()
    : { id: initial.id, state: initial.state, view };
}

import type { BuildResultManifest } from "@hypit/build-result";

import type { CliBuildSubmission, CliBuildView, CliRuntimeControl, CliRuntimeController } from "./runtime-port.js";
import { formatOperationProgress } from "./runtime-view.js";

export type BuildProgressView = {
  readonly build: string;
  readonly phase: string;
  readonly operations: Readonly<Record<string, number>>;
  readonly activity: readonly string[];
};

function operationCounts(view: CliBuildView): Readonly<Record<string, number>> {
  return Object.fromEntries([...new Set(view.operations.map((item) => item.status))]
    .sort().map((state) => [state, view.operations.filter((item) => item.status === state).length]));
}

/** Stable product-state projection for watch output and polling backoff. */
export function buildObservationKey(view: CliBuildView): string {
  return JSON.stringify({
    phase: view.activity,
    outcome: view.outcome,
    issue: view.issue,
    cancellationRequested: view.cancellationRequested,
    operations: operationCounts(view),
  });
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
  let current = initial;
  let lastProgress: string | undefined;
  let pollDelayMs = 100;
  let observedActivity = false;
  const startedAt = Date.now();
  const finishFromResult = async (): Promise<CliBuildSubmission> => {
    const result = await options.readResult();
    if (result?.outcome === undefined) {
      throw new Error(`Build ${current.id} left active Runtime state without a finished Result`);
    }
    return {
      id: current.id,
      state: current.state,
      completion: {
        build: current.id,
        outcome: result.outcome,
        ...(result.failure === undefined ? {} : { reason: result.failure }),
      },
    };
  };
  while ("view" in current && current.view.issue === undefined) {
    const elapsedMs = Date.now() - startedAt;
    const remainingMs = options.maxWaitMs === undefined ? undefined : options.maxWaitMs - elapsedMs;
    if (remainingMs !== undefined && remainingMs <= 0) break;
    const waitMs = remainingMs === undefined ? pollDelayMs : Math.min(pollDelayMs, remainingMs);
    await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
    const view = await runtime.inspect(current.id);
    observedActivity = true;
    if (view === undefined) {
      current = await finishFromResult();
      break;
    }
    current = { id: current.id, state: current.state, view };
    if (current.view.issue === undefined && options.controller !== undefined) {
      const worker = await options.controller.worker.status();
      if (worker.state !== "running") {
        throw new Error(
          `Runtime Worker is ${worker.state}; Build ${current.id} remains durable. `
          + `Run hypit runtime up, then run hypit status ${current.id} --watch again`,
        );
      }
    }
    const operations = operationCounts(view);
    const activity = view.operations
      .filter((item) => item.status === "pending")
      .map((item) => `${item.endpoint}: ${item.progress === undefined
        ? item.status
        : formatOperationProgress(item.progress)}`);
    // Default observation reacts to product state, not every raw Provider progress detail.
    const nextProgress = buildObservationKey(view);
    if (nextProgress !== lastProgress) {
      lastProgress = nextProgress;
      pollDelayMs = 100;
      options.onProgress?.({ build: current.id, phase: view.activity, operations, activity });
    } else {
      pollDelayMs = Math.min(1_000, pollDelayMs * 2);
    }
  }
  if (observedActivity && "view" in current) {
    const view = await runtime.inspect(current.id);
    if (view === undefined) return await finishFromResult();
    current = { id: current.id, state: current.state, view };
  }
  return current;
}

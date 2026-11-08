import { randomBytes } from "node:crypto";

import type { PackageContribution } from "@hypit/loader";
import { orderedBuildId } from "@hypit/protocol";

import {
  assertPlannedRequests,
  assertPreflight,
  describePlanEndpoints,
  evaluatePlanNeeds,
  plannedEndpointQueries,
  preflightPlan,
} from "./build-planning.js";
import type {
  CliRuntime,
  CliRuntimeHost,
  CliRuntimeInspection,
} from "./runtime-port.js";

type Awaitable<T> = T | Promise<T>;

export type LongBuildRequest = Parameters<CliRuntime["build"]>[0];
export type LongBuildSubmission = Awaited<ReturnType<CliRuntime["build"]>>;

/** One accepted long-running Build and the command-scoped resources used to submit and observe it. */
export type LongBuildSession = {
  readonly submission: LongBuildSubmission;
  readonly runtime: CliRuntime;
  readonly inspection: CliRuntimeInspection;
  close(): Promise<void>;
};

/** Public Build identity is assigned by the long-running submission boundary, never by an author format. */
export function createPublicBuildId(now = Date.now()): string {
  return orderedBuildId(now, randomBytes(5).toString("hex").toUpperCase());
}

/**
 * Submit one already prepared finite Build through the common long-running Host path.
 * Compilation and author-document mutation remain outside this boundary.
 */
export async function submitLongBuild(input: {
  readonly host: CliRuntimeHost;
  readonly request: LongBuildRequest;
  readonly packageContributions: readonly PackageContribution[];
  readonly maxWaitMs?: number;
  /** Domain-owned acknowledgement after Runtime has durably accepted the Build. */
  readonly accepted?: (submission: LongBuildSubmission) => Awaitable<void>;
}): Promise<LongBuildSession> {
  const planningPolicy = await input.host.planningPolicy?.();
  const evaluation = await evaluatePlanNeeds(
    input.request.definition,
    input.packageContributions,
    planningPolicy?.producerExecutionLimits,
  );
  const inspection = await input.host.openInspection(
    plannedEndpointQueries(evaluation.state, evaluation),
  );
  let runtime: CliRuntime | undefined;
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    const results = await Promise.allSettled([
      runtime?.close(),
      inspection.close(),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  };
  try {
    const endpoints = await describePlanEndpoints(inspection);
    assertPlannedRequests(evaluation.state, evaluation, endpoints);
    assertPreflight(await preflightPlan(inspection, evaluation.state));
    try {
      await inspection.ensureExecution({
        ...(input.maxWaitMs === undefined ? {} : { maxWaitMs: input.maxWaitMs }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Runtime Worker could not start; no Build was queued: ${detail}`);
    }
    runtime = await inspection.createRuntime();
    const submission = await runtime.build(input.request);
    if (submission.id !== input.request.id) {
      throw new Error(`Runtime accepted Build as ${submission.id}, not ${input.request.id}.`);
    }
    await input.accepted?.(submission);
    return { submission, runtime, inspection, close };
  } catch (error) {
    await close();
    throw error;
  }
}

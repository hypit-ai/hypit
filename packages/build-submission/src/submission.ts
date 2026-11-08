import { randomBytes } from "node:crypto";

import type { PackageContribution } from "@hypit/loader";
import { orderedBuildId } from "@hypit/protocol";
import type { BuildDefinition } from "@hypit/protocol";
import type { ProducerExecutionLimits } from "@hypit/producer";
import type { RuntimeEndpointObservation, RuntimeEndpointQuery } from "@hypit/runtime";

import {
  assertPlannedRequests,
  assertPreflight,
  describePlanEndpoints,
  evaluatePlanNeeds,
  plannedEndpointQueries,
  preflightPlan,
  type SubmissionDiagnostic,
} from "./planning.js";

type Awaitable<T> = T | Promise<T>;

export type BuildSubmissionRuntime<Request, Submission extends { readonly id: string }> = {
  build(request: Request): Promise<Submission>;
  close(): Awaitable<void>;
};

export type BuildSubmissionInspection<Runtime> = {
  endpoints(): Promise<readonly RuntimeEndpointObservation[]>;
  preflight(): Promise<{ readonly diagnostics: readonly SubmissionDiagnostic[] }>;
  ensureExecution(options?: { readonly maxWaitMs?: number }): Promise<{ readonly state: "running" | "stopped" }>;
  createRuntime(): Promise<Runtime>;
  close(): Awaitable<void>;
};

export type BuildSubmissionHost<Inspection> = {
  planningPolicy?(): Promise<{ readonly producerExecutionLimits?: ProducerExecutionLimits }>;
  openInspection(queries: readonly RuntimeEndpointQuery[]): Promise<Inspection>;
};

export type LongBuildSession<Submission, Runtime, Inspection> = {
  readonly submission: Submission;
  readonly runtime: Runtime;
  readonly inspection: Inspection;
  close(): Promise<void>;
};

/** Public Build identity belongs to one submission, never to an author format. */
export function createPublicBuildId(now = Date.now()): string {
  return orderedBuildId(now, randomBytes(5).toString("hex").toUpperCase());
}

/** Submit one already prepared finite Build through a command-scoped Runtime inspection. */
export async function submitLongBuild<
  Request extends { readonly id: string; readonly definition: BuildDefinition },
  Submission extends { readonly id: string },
  Runtime extends BuildSubmissionRuntime<Request, Submission>,
  Inspection extends BuildSubmissionInspection<Runtime>,
>(input: {
  readonly host: BuildSubmissionHost<Inspection>;
  readonly request: Request;
  readonly packageContributions: readonly PackageContribution[];
  readonly maxWaitMs?: number;
  readonly accepted?: (submission: Submission) => Awaitable<void>;
}): Promise<LongBuildSession<Submission, Runtime, Inspection>> {
  const planningPolicy = await input.host.planningPolicy?.();
  const evaluation = await evaluatePlanNeeds(
    input.request.definition,
    input.packageContributions,
    planningPolicy?.producerExecutionLimits,
  );
  const inspection = await input.host.openInspection(
    plannedEndpointQueries(evaluation.state, evaluation),
  );
  let runtime: Runtime | undefined;
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    const results = await Promise.allSettled([runtime?.close(), inspection.close()]);
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

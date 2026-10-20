import { resolve } from "node:path";

import type { PublicationPlan } from "@hypit/result";
import {
  producerPackagesFromFacets,
  registerProducerFacets,
} from "@hypit/producer";
import { evaluateProducerPlan, ProducerRegistry } from "@hypit/executor";
import type { EvaluatedProducerStep } from "@hypit/executor";
import type { PackageContribution } from "@hypit/loader";
import { capabilityKey } from "@hypit/protocol";
import type { BuildDefinition, BuildState, CanonicalValue, CapabilityRef } from "@hypit/protocol";
import type { CliBuildCatalogDescriptor, CliEndpointQuery, CliRuntimeInspection } from "./runtime-port.js";
import { plannedNeeds } from "@hypit/kernel";
import {
  refinementPackagesFromFacets,
  registerTypeRefinements,
  RefinementRegistry,
} from "@hypit/refinement";

export function createCatalogDescriptor(options: {
  readonly source: string;
  readonly publication: PublicationPlan;
  readonly run?: { readonly path: string };
}): CliBuildCatalogDescriptor {
  return {
    source: { path: resolve(options.source) },
    ...(options.run === undefined ? {} : { run: { path: resolve(options.run.path) } }),
    publication: options.publication,
  };
}

/** The author-facing component and operation, without the encoded Source identity. */
function plannedStepLabel(step: string): string {
  let decoded = step;
  try { decoded = decodeURIComponent(step); } catch { /* keep the raw id */ }
  const marker = "::component::";
  const at = decoded.lastIndexOf(marker);
  return at === -1 ? decoded : decoded.slice(at + marker.length);
}

function demandedCapabilities(state: BuildState): readonly CapabilityRef[] {
  const found = new Map(plannedNeeds(state).map((need) => [capabilityKey(need.capability), need.capability]));
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

export type PlanEndpointView = {
  readonly need: string;
  readonly capability: string;
  readonly status: "resolved" | "unresolved" | "ambiguous";
  readonly support: "supported" | "unsupported" | "not-evaluated";
  readonly endpoint?: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: readonly string[];
  readonly rejections?: readonly { readonly endpoint: string; readonly message: string }[];
  readonly binding?: string;
};

export type PlanPricingView = PlanEndpointView & {
  readonly pricingDocuments?: readonly {
    readonly source: string;
    readonly data: CanonicalValue;
    readonly summary?: string;
  }[];
  readonly pricingError?: string;
};

export type PendingPlanInput = {
  readonly input: string;
  readonly record: string;
  readonly sourceStep?: string;
};

/** A bounded presentation of concrete scalar leaves, never a second request payload. */
export type NeedSummary = {
  readonly fields: Readonly<Record<string, string | number | boolean>>;
};

export type EvaluatedPlanNeed = {
  readonly status: "concrete" | "blocked" | "failed" | "unavailable";
  readonly constraints?: CanonicalValue;
  readonly summary?: NeedSummary;
  readonly pending: readonly PendingPlanInput[];
  readonly issue?: string;
};

export type EvaluatedPlan = {
  readonly state: BuildState;
  readonly needs: ReadonlyMap<string, EvaluatedPlanNeed>;
  /** Every deterministic Producer failure, independent of whether that Step declares a Need. */
  readonly producerFailures: readonly {
    readonly step: string;
    readonly message: string;
  }[];
};

export type PlanNeedView = {
  readonly need: string;
  readonly step: string;
  readonly port: string;
  readonly capability: string;
  readonly status: EvaluatedPlanNeed["status"];
  readonly endpoint?: string;
  readonly summary?: NeedSummary;
  readonly pending: readonly PendingPlanInput[];
  readonly issue?: string;
};

function scalarSummary(value: CanonicalValue): string | number | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const display = value.replace(/\s+/gu, " ").trim();
    const characters = [...display];
    return characters.length <= 40 ? display : `${characters.slice(0, 39).join("")}…`;
  }
  return undefined;
}

type SummaryField = {
  readonly path: readonly string[];
  readonly value: string | number | boolean;
};

function collectSummaryFields(
  value: CanonicalValue,
  path: readonly string[],
  fields: SummaryField[],
): void {
  const scalar = scalarSummary(value);
  if (scalar !== undefined) {
    if (path.length > 0) fields.push({ path, value: scalar });
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const tail = path[path.length - 1];
      const itemPath = tail === undefined
        ? [`[${index}]`]
        : [...path.slice(0, -1), `${tail}[${index}]`];
      collectSummaryFields(item, itemPath, fields);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [name, item] of Object.entries(value)) {
    collectSummaryFields(item, [...path, name], fields);
  }
}

/** Generic requests are projected structurally without recognizing domain envelopes or value kinds. */
export function summarizeConstraints(constraints: CanonicalValue): NeedSummary {
  const collected: SummaryField[] = [];
  collectSummaryFields(constraints, [], collected);
  const fields: Record<string, string | number | boolean> = {};
  for (const field of collected) {
    fields[field.path.join(".")] = field.value;
  }
  return { fields };
}

function pendingPlanInputs(step: EvaluatedProducerStep | undefined): readonly PendingPlanInput[] {
  if (step?.status !== "blocked") return [];
  return step.dependencies.map((dependency): PendingPlanInput => {
    const sourceStep = dependency.source.kind === "supplied" ? undefined : dependency.source.step;
    return {
      input: dependency.input,
      record: dependency.record,
      ...(sourceStep === undefined ? {} : { sourceStep }),
    };
  });
}

/**
 * Evaluate deterministic Producers only. A missing upstream value is kept as its direct graph edge,
 * not described as missing author intent and never found by searching for a request-looking object.
 */
export async function evaluatePlanNeeds(
  definition: BuildDefinition,
  contributions: readonly PackageContribution[],
): Promise<EvaluatedPlan> {
  const producers = new ProducerRegistry();
  const refinements = new RefinementRegistry();
  for (const contribution of contributions) {
    const facets = contribution.facets ?? [];
    for (const item of producerPackagesFromFacets(facets)) {
      registerProducerFacets(producers, item.producers ?? []);
    }
    for (const item of refinementPackagesFromFacets(facets)) {
      registerTypeRefinements(refinements, item.refinements ?? []);
    }
  }
  const evaluation = await evaluateProducerPlan(definition, producers, refinements);
  const state = evaluation.state;
  const known = new Map(state.needs.map((need) => [need.id, need]));
  const evaluatedSteps = new Map(evaluation.steps.map((step) => [step.step, step]));
  const result = new Map<string, EvaluatedPlanNeed>();

  for (const planned of plannedNeeds(state)) {
    const evaluatedStep = evaluatedSteps.get(planned.step);
    const need = known.get(planned.need);
    if (need !== undefined) {
      result.set(planned.need, {
        status: "concrete",
        constraints: need.constraints,
        summary: summarizeConstraints(need.constraints),
        pending: [],
      });
      continue;
    }
    if (evaluatedStep === undefined || evaluatedStep.status === "complete") {
      throw new Error(`planned request ${planned.need} has no concrete Need or pending Producer Step`);
    }
    result.set(planned.need, {
      status: evaluatedStep.status,
      pending: pendingPlanInputs(evaluatedStep),
      ...(evaluatedStep.status === "unavailable" ? { issue: evaluatedStep.message } : {}),
    });
  }
  return {
    state,
    needs: result,
    producerFailures: evaluation.steps.flatMap((step) =>
      step.status === "failed" ? [{ step: step.step, message: step.message }] : []),
  };
}

/** The complete pre-Build requests shared by Endpoint selection and Provider pricing reads. */
export function plannedEndpointQueries(
  state: BuildState,
  evaluated: EvaluatedPlan,
): readonly CliEndpointQuery[] {
  const planned = plannedNeeds(state);
  return planned.map((item): CliEndpointQuery => {
    const plannedRequest = evaluated.needs.get(item.need);
    if (plannedRequest === undefined) throw new Error(`planned request ${item.need} has no evaluation result`);
    const base = {
      need: item.need,
      capability: item.capability,
      returns: item.returns,
    };
    if (plannedRequest.status !== "concrete") return { ...base, kind: "demand" };
    if (plannedRequest.constraints === undefined) {
      throw new Error(`concrete planned request ${item.need} has no constraints`);
    }
    return { ...base, kind: "concrete", constraints: plannedRequest.constraints };
  });
}

/** Resolve every planned request independently; concrete constraints exercise Endpoint `supports`. */
export async function describePlanEndpoints(
  inspection: Pick<CliRuntimeInspection, "endpoints">,
  _state: BuildState,
  _evaluated: EvaluatedPlan,
): Promise<readonly PlanEndpointView[]> {
  return (await inspection.endpoints()).map((item) => ({
    need: item.need,
    capability: capabilityKey(item.capability),
    status: item.status,
    support: item.support,
    ...(item.endpoint === undefined ? {} : { endpoint: item.endpoint }),
    ...(item.use === undefined ? {} : { use: item.use }),
    ...(item.pricing === undefined ? {} : { pricing: item.pricing }),
    ...(item.endpoints === undefined ? {} : { endpoints: item.endpoints }),
    ...(item.rejections === undefined ? {} : { rejections: item.rejections }),
    ...(item.binding === undefined ? {} : { binding: item.binding }),
  }));
}

/** Read Provider-owned pricing material relevant to each planned request. */
export async function describePlanPricing(
  inspection: Pick<CliRuntimeInspection, "pricing">,
  _state: BuildState,
  _evaluated: EvaluatedPlan,
): Promise<readonly PlanPricingView[]> {
  const pricing = await inspection.pricing();
  return pricing.map((item): PlanPricingView => ({
    need: item.need,
    capability: capabilityKey(item.capability),
    status: item.status,
    support: item.support,
    ...(item.endpoint === undefined ? {} : { endpoint: item.endpoint }),
    ...(item.use === undefined ? {} : { use: item.use }),
    ...(item.pricing === undefined ? {} : { pricing: item.pricing }),
    ...(item.endpoints === undefined ? {} : { endpoints: item.endpoints }),
    ...(item.rejections === undefined ? {} : { rejections: item.rejections }),
    ...(item.binding === undefined ? {} : { binding: item.binding }),
    ...(item.pricingDocuments === undefined ? {} : { pricingDocuments: item.pricingDocuments }),
    ...(item.pricingError === undefined ? {} : { pricingError: item.pricingError }),
  }));
}

/** Reject known failures and concrete requests that cannot be submitted; blocked requests remain future work. */
export function assertPlannedRequests(
  state: BuildState,
  evaluated: EvaluatedPlan,
  endpoints: readonly PlanEndpointView[],
): void {
  const byNeed = new Map(endpoints.map((item) => [item.need, item]));
  const problems = [
    ...evaluated.producerFailures.map((failure) => `${plannedStepLabel(failure.step)}: ${failure.message}`),
    ...plannedNeeds(state).flatMap((planned) => {
      const subject = plannedStepLabel(planned.step);
      const request = evaluated.needs.get(planned.need);
      if (request === undefined) return [`${subject}: request evaluation is missing`];
      const issue = request?.issue;
      if (issue !== undefined) return [`${subject}: ${issue}`];
      const endpoint = byNeed.get(planned.need);
      if (endpoint?.status === "ambiguous") {
        return [`${subject}: several Endpoints offer ${capabilityKey(planned.capability)}; bind one in the Runtime Profile`];
      }
      if (endpoint?.status !== "resolved") {
        return [`${subject}: no selected Endpoint offers ${capabilityKey(planned.capability)}`];
      }
      if (request.status === "blocked" || request.status === "failed") return [];
      if (endpoint.support === "unsupported") {
        const detail = (endpoint.rejections ?? [])
          .map((rejection) => `${rejection.endpoint}: ${rejection.message}`)
          .join("; ");
        return [`${subject}: ${detail || `no configured Endpoint accepts the complete ${capabilityKey(planned.capability)} request`}`];
      }
      if (request.status === "concrete" && endpoint.support !== "supported") {
        return [`${subject}: selected Endpoint did not evaluate the complete ${capabilityKey(planned.capability)} request`];
      }
      return [];
    }),
  ];
  if (problems.length > 0) {
    throw new Error([
      `Build has ${problems.length} planning problem${problems.length === 1 ? "" : "s"} that prevent submission:`,
      ...problems.map((problem) => `  ${problem}`),
      "No Build was queued and no external request was made.",
    ].join("\n"));
  }
}

export async function preflightPlan(
  inspection: Pick<CliRuntimeInspection, "preflight">,
  state: BuildState,
  _endpoints: readonly PlanEndpointView[],
) {
  const capabilities = demandedCapabilities(state);
  const result = await inspection.preflight();
  return {
    ok: !result.diagnostics.some((item) => item.severity === "error"),
    capabilities: capabilities.map(capabilityKey),
    diagnostics: result.diagnostics,
  } as const;
}

export function assertPreflight(preflight: Awaited<ReturnType<typeof preflightPlan>>): void {
  if (preflight === undefined || preflight.ok) return;
  const errors = preflight.diagnostics.filter((item) => item.severity === "error");
  throw new Error([
    `Runtime preflight failed for ${errors.length} demanded deployment requirement${errors.length === 1 ? "" : "s"}:`,
    ...errors.map((item) => `  ${item.code}${item.subject === undefined ? "" : ` (${item.subject})`}: ${item.message}`),
    "No Build was submitted and no external capability request was made.",
  ].join("\n"));
}

/** Every request in step order, joined to its own Endpoint resolution. */
export function describePlanNeeds(
  state: BuildState,
  evaluated: EvaluatedPlan,
  endpoints: readonly PlanEndpointView[],
): readonly PlanNeedView[] {
  const byNeed = new Map(endpoints.map((item) => [item.need, item]));
  return plannedNeeds(state).map((planned) => {
    const endpoint = byNeed.get(planned.need);
    const found = evaluated.needs.get(planned.need);
    if (found === undefined) {
      throw new Error(`planned request ${planned.need} has no evaluation result`);
    }
    return {
      need: planned.need,
      step: planned.step,
      port: planned.port,
      capability: capabilityKey(planned.capability),
      status: found.status,
      ...(endpoint?.endpoint === undefined ? {} : { endpoint: endpoint.endpoint }),
      ...(found.summary === undefined ? {} : { summary: found.summary }),
      pending: found.pending,
      ...(found.issue === undefined ? {} : { issue: found.issue }),
    };
  });
}

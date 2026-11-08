import { resolve } from "node:path";

import {
  evaluatePlanNeeds,
  plannedEndpointQueries,
  type EvaluatedPlan,
  type PlanEndpointView,
} from "@hypit/build-submission";
import { capabilityKey, typeKey } from "@hypit/protocol";
import type { CanonicalValue, PublicationIntent } from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";
import type { CliBuildAuthoring, CliRuntimeInspection } from "./runtime-port.js";
import type { PlanRequest, PlanRequestOutput, PricingRequest } from "./output.js";
import { plannedNeeds } from "@hypit/kernel";

export {
  assertPlannedRequests,
  assertPreflight,
  describePlanEndpoints,
  evaluatePlanNeeds,
  plannedEndpointQueries,
  preflightPlan,
} from "@hypit/build-submission";
export type { EvaluatedPlan, PlanEndpointView } from "@hypit/build-submission";

export function createBuildAuthoring(options: {
  readonly source: string;
  readonly targets: readonly string[];
  readonly publication: PublicationIntent;
}): CliBuildAuthoring {
  return {
    sourcePath: resolve(options.source),
    targets: options.targets,
    publication: options.publication,
  };
}

export type PlanPricingView = PlanEndpointView & {
  readonly pricingDocuments?: readonly {
    readonly source: string;
    readonly data: CanonicalValue;
    readonly summary?: string;
  }[];
  readonly pricingError?: string;
};

/** Read Provider-owned pricing material relevant to each planned request. */
export async function describePlanPricing(
  inspection: Pick<CliRuntimeInspection, "pricing">,
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

/** Every request in step order, joined to its own Endpoint resolution. */
function describeRequests(
  state: BuildView,
  evaluated: EvaluatedPlan,
  endpoints: readonly PlanEndpointView[],
): readonly PlanRequest[] {
  const byNeed = new Map(endpoints.map((item) => [item.need, item]));
  return plannedNeeds(state).map((planned) => {
    const endpoint = byNeed.get(planned.need);
    const found = evaluated.needs.get(planned.need);
    if (found === undefined) {
      throw new Error(`planned request ${planned.need} has no evaluation result`);
    }
    return {
      capability: capabilityKey(planned.capability),
      readiness: found.status,
      ...(endpoint === undefined ? {} : {
        resolution: endpoint.status,
        support: endpoint.support,
        ...(endpoint.use === undefined ? {} : { use: endpoint.use }),
        ...(endpoint.pricing === undefined ? {} : { pricing: endpoint.pricing }),
        ...(endpoint.endpoints === undefined ? {} : { endpoints: endpoint.endpoints }),
        ...(endpoint.rejections === undefined ? {} : { rejections: endpoint.rejections }),
        ...(endpoint.binding === undefined ? {} : { binding: endpoint.binding }),
      }),
      ...(endpoint?.endpoint === undefined ? {} : { endpoint: endpoint.endpoint }),
      pending: found.pending,
      ...(found.issue === undefined ? {} : { issue: found.issue }),
    };
  });
}

export function describePlanRequests(
  state: BuildView,
  evaluated: EvaluatedPlan,
  endpoints: readonly PlanEndpointView[],
): readonly PlanRequest[] {
  return describeRequests(state, evaluated, endpoints);
}

/** Focus one request without making its execution payload part of the ordinary plan projection. */
export function describePlanRequest(
  source: string,
  ordinal: number,
  state: BuildView,
  evaluated: EvaluatedPlan,
  endpoints: readonly PlanEndpointView[],
): PlanRequestOutput {
  const planned = plannedNeeds(state);
  const selected = planned[ordinal - 1];
  if (selected === undefined) {
    throw new Error(`request ${ordinal} is outside this plan of ${planned.length} requests`);
  }
  const request = describeRequests(state, evaluated, endpoints)[ordinal - 1]!;
  const found = evaluated.needs.get(selected.need);
  if (found === undefined) throw new Error(`planned request ${selected.need} has no evaluation result`);
  return {
    format: "hypit.cli-plan-request@1",
    source,
    ordinal,
    requestCount: planned.length,
    returns: typeKey(selected.returns),
    ...request,
    ...(found.constraints === undefined ? {} : { constraints: found.constraints }),
  };
}

export function describePricingRequests(
  state: BuildView,
  evaluated: EvaluatedPlan,
  pricing: readonly PlanPricingView[],
): readonly PricingRequest[] {
  const byNeed = new Map(pricing.map((item) => [item.need, item]));
  return describeRequests(state, evaluated, pricing).map((request, index) => {
    const planned = plannedNeeds(state)[index]!;
    const item = byNeed.get(planned.need);
    return {
      ...request,
      ...(item?.pricingDocuments === undefined ? {} : { pricingDocuments: item.pricingDocuments }),
      ...(item?.pricingError === undefined ? {} : { pricingError: item.pricingError }),
    };
  });
}

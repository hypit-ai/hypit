import { resolve } from "node:path";

import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import { registerProducerFacets, registerTypeValidatorFacets } from "@hypit/component-kit";
import type {
  PlannedNeedFacet,
  PlannedNeedPresentation,
  PlannedNeedSpecification,
} from "@hypit/component-kit";
import { evaluateProducerPlan, ProducerRegistry } from "@hypit/driver-node";
import type { NodePackageContribution } from "@hypit/package-loader-node";
import type { BuildDefinition, BuildState, CanonicalValue, CapabilityRef } from "@hypit/protocol";
import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import { plannedNeeds } from "@hypit/runtime";
import type { BuildCatalogDescriptor } from "@hypit/runtime";
import { TypeValidatorRegistry } from "@hypit/validation";

export function createCatalogDescriptor(options: {
  readonly source: string;
  readonly compilation: NodeCompiledSourceClosure;
  readonly run?: { readonly path: string };
}): BuildCatalogDescriptor {
  const publishedOutputs = options.compilation.exports.flatMap((item) => {
    if (item.ref.kind === "operation-result") {
      throw new Error(`public output ${item.name} was not lowered to a stable Record or Logical Output`);
    }
    return item.ref.kind === "logical-output" ? [{ name: item.name, ref: item.ref }] : [];
  });
  const names = new Set<string>();
  const outputs = new Set<string>();
  for (const published of publishedOutputs) {
    if (names.has(published.name)) throw new Error(`public Output name ${published.name} is repeated`);
    if (outputs.has(published.ref.id)) {
      throw new Error(`Logical Output ${published.ref.id} has more than one public name`);
    }
    names.add(published.name);
    outputs.add(published.ref.id);
  }
  return {
    source: { path: resolve(options.source) },
    ...(options.run === undefined ? {} : { run: { path: resolve(options.run.path) } }),
    publishedOutputs,
  };
}

function capabilityName(capability: CapabilityRef): string {
  return `${capability.module.name}@${capability.module.version}#${capability.name}`;
}

function sameRef(
  left: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
  right: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
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
  const found = new Map(plannedNeeds(state).map((need) => [capabilityName(need.capability), need.capability]));
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

export type PlanProviderView = {
  readonly request: string;
  readonly capability: string;
  readonly status: "resolved" | "unresolved" | "unsupported" | "ambiguous";
  readonly endpoint?: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: readonly string[];
  readonly rejections?: readonly { readonly endpoint: string; readonly message: string }[];
  readonly binding?: string;
};

export type PlanPricingView = PlanProviderView & {
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
  readonly kind?: "image" | "video" | "audio" | "other";
};

/** A reading of one request's authored parameters, never a second request payload. */
export type NeedSummary = {
  readonly fields: Readonly<Record<string, string | number | boolean>>;
  readonly references: Readonly<Record<string, number>>;
};

export type EvaluatedPlanNeed = {
  readonly constraints?: CanonicalValue;
  /** Package-owned support slots; kept separate from the CLI's compact pending-input view. */
  readonly pendingInputs: PlannedNeedSpecification["pendingInputs"];
  readonly summary?: NeedSummary;
  readonly pending: readonly PendingPlanInput[];
  readonly issue?: string;
};

export type EvaluatedPlan = {
  readonly state: BuildState;
  readonly needs: ReadonlyMap<string, EvaluatedPlanNeed>;
};

export type PlanNeedView = {
  readonly request: string;
  readonly step: string;
  readonly port: string;
  readonly capability: string;
  readonly endpoint?: string;
  readonly summary?: NeedSummary;
  readonly pending: readonly PendingPlanInput[];
  readonly issue?: string;
};

function mediaKind(mediaType: string): string {
  const prefix = mediaType.split("/")[0] ?? "";
  return prefix === "image" || prefix === "video" || prefix === "audio" ? prefix : "other";
}

function countReferences(value: CanonicalValue, references: Record<string, number>): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) countReferences(item, references);
    return;
  }
  const record = value as Record<string, CanonicalValue>;
  if (typeof record.resource === "string" && typeof record.mediaType === "string") {
    const kind = mediaKind(record.mediaType);
    references[kind] = (references[kind] ?? 0) + 1;
    return;
  }
  for (const item of Object.values(record)) countReferences(item, references);
}

function textMeasure(value: string): string {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/u).filter(Boolean);
  const cjk = [...trimmed].filter((character) =>
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)).length;
  if (cjk > 0 && words.length <= 1) return `${cjk} chars`;
  return `${words.length} words`;
}

function scalarSummary(value: CanonicalValue): string | number | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length <= 40 && !value.includes("\n") ? value : textMeasure(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, CanonicalValue>;
    if (typeof record.text === "string" && Object.keys(record).length <= 2) return scalarSummary(record.text);
  }
  return undefined;
}

function summarizeFields(source: Readonly<Record<string, CanonicalValue>>): Readonly<Record<string, string | number | boolean>> {
  const fields: Record<string, string | number | boolean> = {};
  for (const [name, value] of Object.entries(source)) {
    const values = Array.isArray(value) ? value : [value];
    const scalars = values.map(scalarSummary).filter((item): item is string | number | boolean => item !== undefined);
    if (scalars.length > 0) fields[name] = scalars.length === 1 ? scalars[0]! : scalars.map(String).join(", ");
  }
  return fields;
}

/** Generic requests are summarized only from their declared top-level constraints. */
export function summarizeConstraints(constraints: CanonicalValue): NeedSummary {
  const references: Record<string, number> = {};
  countReferences(constraints, references);
  if (constraints === null || typeof constraints !== "object" || Array.isArray(constraints)) {
    return { fields: {}, references };
  }
  return { fields: summarizeFields(constraints as Record<string, CanonicalValue>), references };
}

/** Convert a package-owned request presentation into the compact generic CLI view. */
function summarizePresentation(presentation: PlannedNeedPresentation): NeedSummary {
  const fields: Record<string, string | number | boolean> = {};
  for (const [name, values] of Object.entries(presentation.fields)) {
    const summarized = values.map((value) => scalarSummary(value as CanonicalValue))
      .filter((value): value is string | number | boolean => value !== undefined);
    if (summarized.length > 0) fields[name] = summarized.length === 1 ? summarized[0]! : summarized.map(String).join(", ");
  }
  return { fields, references: structuredClone(presentation.references) };
}

function plannedNeedFacets(contributions: readonly NodePackageContribution[]): readonly PlannedNeedFacet[] {
  return contributions.flatMap((contribution) =>
    (contribution.components ?? []).flatMap((component) => component.plannedNeeds ?? []));
}

function plannedNeedFacetFor(
  facets: readonly PlannedNeedFacet[],
  state: BuildState,
  stepId: string,
  port: string,
  capability: CapabilityRef,
): PlannedNeedFacet | undefined {
  const step = state.plan.steps.find((item) => item.id === stepId);
  if (step === undefined) return undefined;
  return facets.find((facet) => facet.port === port
    && sameRef(facet.capability, capability)
    && sameRef(facet.producer, step.producer));
}

/**
 * Evaluate deterministic Producers only. A missing upstream value is kept as its direct graph edge,
 * not described as missing author intent and never found by searching for a request-looking object.
 */
export async function evaluatePlanNeeds(
  definition: BuildDefinition,
  contributions: readonly NodePackageContribution[],
): Promise<EvaluatedPlan> {
  const producers = new ProducerRegistry();
  const validators = new TypeValidatorRegistry();
  for (const contribution of contributions) {
    for (const component of contribution.components ?? []) {
      registerProducerFacets(producers, component.producers ?? []);
      registerTypeValidatorFacets(validators, component.validators ?? []);
    }
  }
  const evaluation = await evaluateProducerPlan(definition, producers, validators);
  const state = evaluation.state;
  const known = new Map(state.needs.map((need) => [need.id, need]));
  const producedBy = new Map(state.plan.steps.flatMap((step) =>
    Object.values(step.outputs).map((record) => [record, step.id] as const)));
  const records = new Set(state.records.map((record) => record.id));
  const facets = plannedNeedFacets(contributions);
  const result = new Map<string, EvaluatedPlanNeed>();

  for (const planned of plannedNeeds(state)) {
    const facet = plannedNeedFacetFor(facets, state, planned.step, planned.port, planned.capability);
    const need = known.get(planned.need);
    if (need !== undefined) {
      const specification: PlannedNeedSpecification = { constraints: need.constraints, pendingInputs: [] };
      result.set(planned.need, {
        constraints: need.constraints,
        pendingInputs: [],
        summary: facet?.present === undefined
          ? summarizeConstraints(need.constraints)
          : summarizePresentation(facet.present(specification)),
        pending: [],
      });
      continue;
    }

    const specification = facet?.plan({ state, step: planned.step, port: planned.port });
    if (facet !== undefined && specification !== undefined) {
      const pending = specification.pendingInputs.map((item): PendingPlanInput => ({
        input: item.input,
        record: item.record,
        ...(item.sourceStep === undefined ? {} : { sourceStep: item.sourceStep }),
        ...(item.role === undefined ? {} : {
          kind: item.role === "image" || item.role === "video" || item.role === "audio" ? item.role : "other",
        }),
      }));
      const issue = evaluation.failures.get(planned.step);
      result.set(planned.need, {
        constraints: specification.constraints,
        pendingInputs: specification.pendingInputs,
        summary: facet.present === undefined
          ? summarizeConstraints(specification.constraints)
          : summarizePresentation(facet.present(specification)),
        pending,
        ...(issue === undefined ? {} : { issue }),
      });
      continue;
    }

    const step = state.plan.steps.find((item) => item.id === planned.step);
    const pending = step === undefined ? [] : Object.entries(step.inputs)
      .filter(([, record]) => !records.has(record))
      .map(([input, record]): PendingPlanInput => {
        const sourceStep = producedBy.get(record);
        return { input, record, ...(sourceStep === undefined ? {} : { sourceStep }) };
      });
    const issue = evaluation.failures.get(planned.step);
    result.set(planned.need, {
      pendingInputs: [],
      pending,
      issue: issue === undefined
        ? `Package does not describe the complete request for ${capabilityName(planned.capability)} before Build`
        : `${issue}; package also does not describe the complete request for ${capabilityName(planned.capability)} before Build`,
    });
  }
  return { state, needs: result };
}

/** The complete pre-Build requests shared by Endpoint selection and Provider pricing reads. */
export function plannedProviderQueries(
  state: BuildState,
  evaluated: EvaluatedPlan,
): readonly import("@hypit/runtime-host-node").RuntimeHostProviderQuery[] {
  const planned = plannedNeeds(state);
  return planned.flatMap((item) => {
    const plannedRequest = evaluated.needs.get(item.need);
    const constraints = plannedRequest?.constraints;
    if (plannedRequest === undefined || constraints === undefined) return [];
    return [{
      request: item.need,
      capability: item.capability,
      returns: item.returns,
      constraints,
      ...(plannedRequest.pendingInputs.length === 0 ? {} : {
        pendingInputs: plannedRequest.pendingInputs.map((input) => ({
          input: input.input,
          ...(input.role === undefined ? {} : { role: input.role }),
        })),
      }),
    }];
  });
}

/** Resolve every planned request independently; concrete constraints exercise Endpoint `supports`. */
export async function describePlanProviders(
  host: NodeRuntimeHost,
  state: BuildState,
  evaluated: EvaluatedPlan,
): Promise<readonly PlanProviderView[]> {
  const planned = plannedNeeds(state);
  const requests = plannedProviderQueries(state, evaluated);
  const described = (await host.providers(requests)).map((item) => ({
    request: item.request,
    capability: capabilityName(item.capability),
    status: item.status,
    ...(item.endpoint === undefined ? {} : { endpoint: item.endpoint }),
    ...(item.use === undefined ? {} : { use: item.use }),
    ...(item.pricing === undefined ? {} : { pricing: item.pricing }),
    ...(item.endpoints === undefined ? {} : { endpoints: item.endpoints }),
    ...(item.rejections === undefined ? {} : { rejections: item.rejections }),
    ...(item.binding === undefined ? {} : { binding: item.binding }),
  }));
  return planned.map((item) => described.find((provider) => provider.request === item.need) ?? {
    request: item.need,
    capability: capabilityName(item.capability),
    status: "unresolved" as const,
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.request === item.request) === index);
}

/** Read Provider-owned pricing material relevant to each planned request. */
export async function describePlanPricing(
  host: NodeRuntimeHost,
  state: BuildState,
  evaluated: EvaluatedPlan,
): Promise<readonly PlanPricingView[]> {
  const planned = plannedNeeds(state);
  const requests = plannedProviderQueries(state, evaluated);
  const pricing = await host.pricing(requests);
  const described = pricing.map((item): PlanPricingView => ({
    request: item.request,
    capability: capabilityName(item.capability),
    status: item.status,
    ...(item.endpoint === undefined ? {} : { endpoint: item.endpoint }),
    ...(item.use === undefined ? {} : { use: item.use }),
    ...(item.pricing === undefined ? {} : { pricing: item.pricing }),
    ...(item.endpoints === undefined ? {} : { endpoints: item.endpoints }),
    ...(item.rejections === undefined ? {} : { rejections: item.rejections }),
    ...(item.binding === undefined ? {} : { binding: item.binding }),
    ...(item.pricingDocuments === undefined ? {} : { pricingDocuments: item.pricingDocuments }),
    ...(item.pricingError === undefined ? {} : { pricingError: item.pricingError }),
  }));
  return planned.map((item) => described.find((entry) => entry.request === item.need) ?? {
    request: item.need,
    capability: capabilityName(item.capability),
    status: "unresolved" as const,
  }).filter((item, index, all) => all.findIndex((candidate) => candidate.request === item.request) === index);
}

/** Refuse a Build before it is queued when any external request is not fully selectable. */
export function assertPlannedRequests(
  state: BuildState,
  evaluated: EvaluatedPlan,
  providers: readonly PlanProviderView[],
): void {
  const byRequest = new Map(providers.map((item) => [item.request, item]));
  const problems = plannedNeeds(state).flatMap((planned) => {
    const subject = plannedStepLabel(planned.step);
    const issue = evaluated.needs.get(planned.need)?.issue;
    if (issue !== undefined) return [`${subject}: ${issue}`];
    const provider = byRequest.get(planned.need);
    if (provider?.status === "resolved") return [];
    if (provider?.status === "ambiguous") {
      return [`${subject}: several Endpoints accept ${capabilityName(planned.capability)}; bind one in the Runtime Profile`];
    }
    if (provider?.status === "unsupported") {
      const detail = (provider.rejections ?? [])
        .map((rejection) => `${rejection.endpoint}: ${rejection.message}`)
        .join("; ");
      return [`${subject}: ${detail || `no configured Endpoint accepts the complete ${capabilityName(planned.capability)} request`}`];
    }
    return [`${subject}: no selected Endpoint accepts the complete ${capabilityName(planned.capability)} request`];
  });
  if (problems.length > 0) {
    throw new Error([
      `Build has ${problems.length} external request${problems.length === 1 ? "" : "s"} that cannot be submitted:`,
      ...problems.map((problem) => `  ${problem}`),
      "No Build was queued and no external request was made.",
    ].join("\n"));
  }
}

export async function preflightPlan(host: NodeRuntimeHost, state: BuildState) {
  const capabilities = demandedCapabilities(state);
  const result = await host.preflight({ capabilities });
  return {
    ok: !result.diagnostics.some((item) => item.severity === "error"),
    capabilities: capabilities.map(capabilityName),
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
  providers: readonly PlanProviderView[],
): readonly PlanNeedView[] {
  const endpoint = new Map(providers.map((item) => [item.request, item]));
  return plannedNeeds(state).map((planned) => {
    const provider = endpoint.get(planned.need);
    const found = evaluated.needs.get(planned.need);
    return {
      request: planned.need,
      step: planned.step,
      port: planned.port,
      capability: capabilityName(planned.capability),
      ...(provider?.endpoint === undefined ? {} : { endpoint: provider.endpoint }),
      ...(found?.summary === undefined ? {} : { summary: found.summary }),
      pending: found?.pending ?? [],
      ...(found?.issue === undefined ? {} : { issue: found.issue }),
    };
  });
}

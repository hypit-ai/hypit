import { resolve } from "node:path";

import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import { registerProducerFacets, registerTypeValidatorFacets } from "@hypit/component-kit";
import { evaluateProducerPlan, ProducerRegistry } from "@hypit/driver-node";
import { isMediaPort } from "@hypit/generation";
import type { GenerationPortTable, GenerationRequestDraft } from "@hypit/generation";
import { exactModelsFromHostFacets, plannedExactModelRequest } from "@hypit/model-kit";
import type { ExactModelEndpoint } from "@hypit/model-kit";
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

function demandedCapabilities(state: BuildState): readonly CapabilityRef[] {
  const found = new Map(plannedNeeds(state).map((need) => [capabilityName(need.capability), need.capability]));
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

export type PlanProviderView = {
  readonly request: string;
  readonly capability: string;
  readonly status: "resolved" | "unresolved" | "ambiguous";
  readonly endpoint?: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: readonly string[];
  readonly binding?: string;
  readonly checked: "request" | "capability";
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
  readonly checked?: "request" | "capability";
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

/** Exact-model requests are summarized from the model package's port table, not an object-shape guess. */
function summarizeExactModel(
  table: GenerationPortTable,
  ports: GenerationRequestDraft["ports"],
  pending: readonly PendingPlanInput[],
): NeedSummary {
  const fields: Record<string, string | number | boolean> = {};
  const references: Record<string, number> = {};
  for (const port of table.ports) {
    const values = ports[port.name] ?? [];
    if (isMediaPort(port)) {
      for (const value of values) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
        const role = (value as { readonly role?: unknown }).role;
        if (role === "image" || role === "video" || role === "audio") references[role] = (references[role] ?? 0) + 1;
      }
      continue;
    }
    const summarized = values.map((value) => scalarSummary(value as CanonicalValue))
      .filter((value): value is string | number | boolean => value !== undefined);
    if (summarized.length > 0) fields[port.name] = summarized.length === 1 ? summarized[0]! : summarized.map(String).join(", ");
  }
  for (const item of pending) {
    const kind = item.kind ?? "other";
    references[kind] = (references[kind] ?? 0) + 1;
  }
  return { fields, references };
}

function exactModels(contributions: readonly NodePackageContribution[]): readonly ExactModelEndpoint[] {
  return exactModelsFromHostFacets(contributions.flatMap((item) => item.hostFacets ?? []));
}

function exactModelFor(
  models: readonly ExactModelEndpoint[],
  state: BuildState,
  stepId: string,
  capability: CapabilityRef,
): ExactModelEndpoint | undefined {
  const step = state.plan.steps.find((item) => item.id === stepId);
  if (step === undefined) return undefined;
  return models.find((model) => sameRef(model.capability, capability) && sameRef(model.producer, step.producer));
}

/**
 * Evaluate deterministic Producers only. A missing upstream Resource is kept as its direct graph
 * edge, not described as missing author intent and never found by searching for a request-looking
 * object.
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
  const models = exactModels(contributions);
  const result = new Map<string, EvaluatedPlanNeed>();

  for (const planned of plannedNeeds(state)) {
    const need = known.get(planned.need);
    if (need !== undefined) {
      const model = exactModelFor(models, state, planned.step, planned.capability);
      const exact = model === undefined ? undefined : plannedExactModelRequest(state, planned.step, planned.port, model);
      result.set(planned.need, {
        constraints: need.constraints,
        summary: model === undefined || exact === undefined
          ? summarizeConstraints(need.constraints)
          : summarizeExactModel(model.ports, exact.ports, []),
        pending: [],
      });
      continue;
    }

    const model = exactModelFor(models, state, planned.step, planned.capability);
    const exact = model === undefined ? undefined : plannedExactModelRequest(state, planned.step, planned.port, model);
    if (model !== undefined && exact !== undefined) {
      const pending = exact.pendingMedia.map((item): PendingPlanInput => ({
        input: item.port,
        record: item.record,
        ...(item.sourceStep === undefined ? {} : { sourceStep: item.sourceStep }),
        kind: item.role,
      }));
      const issue = evaluation.failures.get(planned.step);
      result.set(planned.need, {
        summary: summarizeExactModel(model.ports, exact.ports, pending),
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
      pending,
      ...(issue === undefined ? {} : { issue }),
    });
  }
  return { state, needs: result };
}

/** Resolve every planned request independently; concrete constraints exercise Endpoint `supports`. */
export async function describePlanProviders(
  host: NodeRuntimeHost,
  state: BuildState,
  evaluated: EvaluatedPlan,
): Promise<readonly PlanProviderView[]> {
  const requests = plannedNeeds(state).map((planned) => {
    const constraints = evaluated.needs.get(planned.need)?.constraints;
    return {
      request: planned.need,
      capability: planned.capability,
      returns: planned.returns,
      ...(constraints === undefined ? {} : { constraints }),
    };
  });
  return (await host.providers(requests)).map((item) => ({
    request: item.request,
    capability: capabilityName(item.capability),
    status: item.status,
    checked: item.checked,
    ...(item.endpoint === undefined ? {} : { endpoint: item.endpoint }),
    ...(item.use === undefined ? {} : { use: item.use }),
    ...(item.pricing === undefined ? {} : { pricing: item.pricing }),
    ...(item.endpoints === undefined ? {} : { endpoints: item.endpoints }),
    ...(item.binding === undefined ? {} : { binding: item.binding }),
  }));
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
      ...(provider?.checked === undefined ? {} : { checked: provider.checked }),
    };
  });
}

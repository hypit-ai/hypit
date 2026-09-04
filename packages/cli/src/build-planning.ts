import { resolve } from "node:path";

import type { NodeCompiledSourceClosure } from "@hypit/compiler-node";
import type { NodeRuntimeHost } from "@hypit/runtime-host-node";
import { plannedNeeds } from "@hypit/runtime";
import type { BuildCatalogDescriptor } from "@hypit/runtime";
import type { BuildState, CapabilityRef } from "@hypit/protocol";

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

function demandedCapabilities(state: BuildState): readonly CapabilityRef[] {
  const found = new Map(plannedNeeds(state).map((need) => [capabilityName(need.capability), need.capability]));
  return [...found.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

export type PlanProviderView = {
  readonly capability: string;
  readonly status: "resolved" | "unresolved" | "ambiguous";
  readonly endpoint?: string;
  readonly use?: string;
  readonly pricing?: { readonly kind: "page"; readonly url: string } | { readonly kind: "local" };
  readonly endpoints?: readonly string[];
  readonly binding?: string;
};

/** Which Endpoint and price page stand behind each demanded capability; reads the Profile only. */
export async function describePlanProviders(host: NodeRuntimeHost, state: BuildState): Promise<readonly PlanProviderView[]> {
  const providers = await host.providers(demandedCapabilities(state));
  return providers.map((item) => ({
    capability: capabilityName(item.capability),
    status: item.status,
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

// ---------------------------------------------------------------------------------------------------
// The complete bill of needs: every request the Build will make, with its parameters known before
// anything is paid for.

import { BuildMachine } from "@hypit/core";
import { registerProducerFacets, registerTypeValidatorFacets } from "@hypit/component-kit";
import { EndpointRegistry, MemoryResourceStore, NodeDriver, ProducerRegistry } from "@hypit/driver-node";
import type { NodePackageContribution } from "@hypit/package-loader-node";
import type { BuildDefinition, CanonicalValue } from "@hypit/protocol";
import { TypeValidatorRegistry } from "@hypit/validation";

/** A reading of one request's parameters, taken from the values the request actually carries. */
export type NeedSummary = {
  /** Scalar parameters by their own names: numbers, short strings, booleans, and `N words` for prose. */
  readonly fields: Readonly<Record<string, string | number | boolean>>;
  /** Referenced media counted by kind (image, video, audio, other). */
  readonly references: Readonly<Record<string, number>>;
};

export type PlanNeedView = {
  readonly step: string;
  readonly port: string;
  readonly capability: string;
  readonly endpoint?: string;
  /** Present when the request's parameters were computed at plan time. */
  readonly summary?: NeedSummary;
  /** Why the parameters are not known yet, when they are not. */
  readonly unknown?: string;
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

function scalarSummary(value: CanonicalValue): string | number | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const words = value.trim().split(/\s+/u).filter((word) => word.length > 0).length;
    return value.length <= 40 && !value.includes("\n") ? value : `${words} words`;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, CanonicalValue>;
    if (typeof record.text === "string" && Object.keys(record).length <= 2) return scalarSummary(record.text);
  }
  return undefined;
}

/**
 * Read a request's parameters off the request itself: every scalar it carries under its own name,
 * every referenced Artifact counted by kind. No model-specific field list lives here; a request
 * shaped as `{ ports }` (an exact-model generation request) reads each port, anything else reads its
 * top-level fields.
 */
export function summarizeConstraints(constraints: CanonicalValue): NeedSummary {
  const fields: Record<string, string | number | boolean> = {};
  const references: Record<string, number> = {};
  countReferences(constraints, references);
  if (constraints === null || typeof constraints !== "object" || Array.isArray(constraints)) return { fields, references };
  const record = constraints as Record<string, CanonicalValue>;
  const ports = record.ports;
  const source = ports !== null && typeof ports === "object" && !Array.isArray(ports)
    ? ports as Record<string, CanonicalValue>
    : record;
  for (const [name, value] of Object.entries(source)) {
    const values = Array.isArray(value) ? value : [value];
    const scalars = values.map(scalarSummary).filter((item): item is string | number | boolean => item !== undefined);
    if (scalars.length === 0) continue;
    fields[name] = scalars.length === 1 ? scalars[0]! : scalars.map(String).join(", ");
  }
  return { fields, references };
}

/**
 * Run the plan's Producers that need nothing from outside, so every external request exists with
 * its exact constraints before the Build is submitted. Producers that would need an external result,
 * or bytes this planning pass does not hold, are left as they are; their requests stay unknown and
 * say why. Nothing here contacts a Provider or spends anything.
 */
export async function evaluatePlanNeeds(
  definition: BuildDefinition,
  contributions: readonly NodePackageContribution[],
): Promise<ReadonlyMap<string, { readonly constraints?: CanonicalValue; readonly unknown?: string }>> {
  const producers = new ProducerRegistry();
  const validators = new TypeValidatorRegistry();
  for (const contribution of contributions) {
    for (const component of contribution.components ?? []) {
      registerProducerFacets(producers, component.producers ?? []);
      registerTypeValidatorFacets(validators, component.validators ?? []);
    }
  }
  const driver = new NodeDriver({ producers, endpoints: new EndpointRegistry(), resources: new MemoryResourceStore(), validators });
  const machine = new BuildMachine(definition);
  const failed = new Map<string, string>();
  let blockedProducers = new Map<string, string>();
  for (let round = 0; round < 10_000; round += 1) {
    const prepared = driver.prepare(machine.view());
    blockedProducers = new Map(prepared.blocked
      .filter((item) => item.reason === "missing-producer")
      .map((item) => [item.command, `no Producer for ${item.subject} is loaded at plan time`]));
    const runnable = prepared.runnable.filter((item) =>
      item.command.kind === "invoke-producer" && !failed.has(item.command.id));
    if (runnable.length === 0) break;
    let advanced = false;
    for (const descriptor of runnable) {
      let result: Awaited<ReturnType<NodeDriver["executeCommand"]>>;
      try {
        result = await driver.executeCommand(prepared.state, descriptor, { build: "plan" });
      } catch (error) {
        failed.set(descriptor.command.id, error instanceof Error ? error.message : String(error));
        continue;
      }
      if (result.status !== "completed" || result.event.kind === "command-failed") {
        failed.set(descriptor.command.id, result.status === "completed" && result.event.kind === "command-failed"
          ? result.event.message
          : "the step did not complete at plan time");
        continue;
      }
      machine.evaluate(result.event);
      machine.commit();
      advanced = true;
      break;
    }
    if (!advanced) break;
  }
  const state = machine.view();
  const known = new Map(state.needs.map((need) => [need.id, need]));
  const stepFailures = new Map<string, string>();
  for (const [command, message] of [...blockedProducers, ...failed]) {
    const step = state.plan.steps.find((item) => command.endsWith(item.id))?.id ?? command;
    stepFailures.set(step, message);
  }
  const result = new Map<string, { readonly constraints?: CanonicalValue; readonly unknown?: string }>();
  for (const planned of plannedNeeds(state)) {
    const need = known.get(planned.need);
    if (need !== undefined) {
      result.set(planned.need, { constraints: need.constraints });
      continue;
    }
    const failure = stepFailures.get(planned.step);
    const step = state.plan.steps.find((item) => item.id === planned.step);
    const draft = step === undefined ? undefined : requestDraft(state, step);
    result.set(planned.need, {
      ...(draft === undefined ? {} : { constraints: draft }),
      unknown: failure === undefined
        ? (draft === undefined ? "depends on an earlier external result" : "references come from an earlier external result")
        : `its step could not run at plan time: ${failure}`,
    });
  }
  return result;
}

/**
 * When a request step cannot run yet because a reference it needs is still to be generated, the
 * author's own parameters already exist upstream: the request draft the step's inputs were built
 * from. Walk from the step's missing inputs to the steps that produce them, and read the first
 * present record shaped as a request (`{ ports }`). The media it would attach is what is pending.
 */
function requestDraft(state: BuildState, step: BuildState["plan"]["steps"][number]): CanonicalValue | undefined {
  const records = new Map(state.records.map((item) => [item.id, item]));
  const producedBy = new Map(state.plan.steps.flatMap((item) => Object.values(item.outputs).map((id) => [id, item] as const)));
  const seen = new Set<string>();
  const queue = [step];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    for (const id of Object.values(current.inputs)) {
      const record = records.get(id);
      if (record !== undefined) {
        const value = record.value;
        if (value.kind === "inline" && value.value !== null && typeof value.value === "object"
          && !Array.isArray(value.value) && "ports" in value.value) return value.value;
        continue;
      }
      const producer = producedBy.get(id);
      if (producer !== undefined) queue.push(producer);
    }
  }
  return undefined;
}

/** Every request in step order, with the Endpoint behind it and its parameters when known. */
export async function describePlanNeeds(
  state: BuildState,
  evaluated: ReadonlyMap<string, { readonly constraints?: CanonicalValue; readonly unknown?: string }>,
  providers: readonly PlanProviderView[],
): Promise<readonly PlanNeedView[]> {
  const endpoints = new Map(providers.map((item) => [item.capability, item.endpoint]));
  return plannedNeeds(state).map((planned) => {
    const capability = capabilityName(planned.capability);
    const endpoint = endpoints.get(capability);
    const found = evaluated.get(planned.need);
    return {
      step: planned.step,
      port: planned.port,
      capability,
      ...(endpoint === undefined ? {} : { endpoint }),
      ...(found?.constraints === undefined ? {} : { summary: summarizeConstraints(found.constraints) }),
      ...(found?.unknown === undefined ? {} : { unknown: found.unknown }),
    };
  });
}

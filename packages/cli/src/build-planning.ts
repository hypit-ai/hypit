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

import { resolve } from "node:path";

import { MemoryResourceStore } from "@hypit/executor";
import { capabilityKey } from "@hypit/protocol";
import type { Need } from "@hypit/protocol";
import type { ResourceStore } from "@hypit/runtime";

import type { CliApplicationContext } from "./application.js";
import type { CliDistribution } from "./distribution.js";
import type { CliEndpointObservation, CliRuntimeHost } from "./runtime-port.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Ephemeral resources for one immediate CLI request; no Build or Result state is created. */
export function createCliScratchResources(): ResourceStore {
  return new MemoryResourceStore();
}

/** Application facts required to select one Runtime Host for an immediate command. */
export type CliRuntimeSelectionContext = Pick<CliApplicationContext, "cwd" | "resolveProjectRoot"> & {
  readonly distribution: Pick<CliDistribution, "packageRoot" | "resolveProjectRuntime" | "openRuntimeHost">;
};

/** Open the Runtime Profile explicitly named by a command, or the one selected by its project. */
export async function openCliRuntimeHost(
  application: CliRuntimeSelectionContext,
  runtime: string | undefined,
  project: string | undefined,
): Promise<{ readonly profile: string; readonly host: CliRuntimeHost; readonly projectRoot: string }> {
  const projectRoot = await application.resolveProjectRoot(
    project === undefined ? undefined : resolve(application.cwd, project),
  );
  const profile = runtime === undefined
    ? (await application.distribution.resolveProjectRuntime?.(projectRoot))?.profile
    : resolve(application.cwd, runtime);
  assert(profile !== undefined,
    `No Runtime Profile is selected for ${projectRoot}; run hypit runtime use <profile> there, or pass --runtime <profile>`);
  const host = await application.distribution.openRuntimeHost(profile, {
    packageRoot: projectRoot,
    ...(application.distribution.packageRoot === undefined
      ? {}
      : { distributionPackageRoot: application.distribution.packageRoot }),
  });
  return { profile, host, projectRoot };
}

/** Resolve one immediate request before spending, preserving the selected Endpoint's explanation. */
export async function selectCliEndpoint(
  host: Pick<CliRuntimeHost, "endpoints">,
  need: Need,
  profile: string,
): Promise<CliEndpointObservation> {
  const [endpoint] = await host.endpoints([{
    kind: "concrete",
    need: need.id,
    capability: need.capability,
    returns: need.returns,
    constraints: need.constraints,
  }]);
  const subject = capabilityKey(need.capability);
  assert(endpoint !== undefined && endpoint.status !== "unresolved",
    `No Endpoint in ${profile} serves ${subject}; configure an Endpoint that supports this capability and check its binding in that Profile`);
  assert(endpoint.status !== "ambiguous",
    `Several Endpoints in ${profile} serve ${subject}: ${(endpoint.endpoints ?? []).join(", ")}; select one with bindings[${JSON.stringify(subject)}] in that Profile`);
  assert(endpoint.support !== "unsupported",
    `The selected Endpoint in ${profile} does not support this request for ${subject}`
    + (endpoint.binding === undefined ? "" : ` (binding: ${endpoint.binding})`)
    + `: ${(endpoint.rejections ?? []).map((item) => `${item.endpoint}: ${item.message}`).join("; ") || "no support reason supplied"}`
    + "; adjust the request or select a compatible Endpoint in that Profile");
  return endpoint;
}

export function cliEndpointView(endpoint: CliEndpointObservation) {
  return {
    endpoint: endpoint.endpoint ?? null,
    use: endpoint.use ?? null,
    pricing: endpoint.pricing ?? null,
  };
}

export function cliEndpointLine(endpoint: CliEndpointObservation): string {
  const price = endpoint.pricing === undefined
    ? "price source unknown"
    : endpoint.pricing.kind === "local" ? "local, no Provider charge" : endpoint.pricing.url;
  return `${endpoint.endpoint} (${endpoint.use})  ·  ${price}`;
}

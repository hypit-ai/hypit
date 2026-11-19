import { join } from "node:path";
import { openLocalExecutionEnvironment } from "@hypit/execution/node";
import { createHypiHubProvider, type HypiHubAuthentication, type HypiHubOptions } from "@hypit/provider-hypihub";
import type { ExecutionEnvironment } from "@hypit/execution";
import { nodeHypitDataRoot } from "./node-data-root.js";

export * from "@hypit/execution/node";
export type { HypiHubOAuthConnection, HypiHubOAuthRecord, HypiHubOAuthStatus, HypiHubOAuthStore } from "@hypit/provider-hypihub";
export * from "./hypihub-auth-node.js";
export { nodeHypitDataRoot } from "./node-data-root.js";

export type OpenNodeHypiHubEnvironmentOptions = Omit<HypiHubOptions, "id" | keyof HypiHubAuthentication> & HypiHubAuthentication & {
  readonly dataRoot?: string;
  readonly accountConcurrency?: number;
  /** Optional configured capability subset, using exact Model Capability IDs. */
  readonly capabilities?: readonly string[];
  /** Optional narrower in-flight limits, by exact Model Capability ID. */
  readonly modelConcurrency?: Readonly<Record<string, number>>;
};

/** Select the HypiHub account and capability subset for this environment deployment. */
export async function openNodeHypiHubEnvironment(options: OpenNodeHypiHubEnvironmentOptions): Promise<ExecutionEnvironment> {
  const { dataRoot, accountConcurrency = 1, modelConcurrency = {}, capabilities, ...provider } = options;
  const hypihub = createHypiHubProvider({ ...provider, id: "hypihub" });
  const available = hypihub.endpoints;
  const selected = capabilities === undefined ? available : capabilities.map(capability => {
    const endpoint = available.find(item => item.capability.id === capability);
    if (endpoint === undefined) throw new Error(`HypiHub does not implement Capability ${capability}.`);
    return endpoint;
  });
  const configured = new Set(selected.map(item => item.capability.id));
  for (const capability of Object.keys(modelConcurrency)) {
    if (!configured.has(capability)) throw new Error(`HypiHub model limit refers to unselected Capability ${capability}.`);
  }
  const limits = Object.entries(modelConcurrency).sort(([a], [b]) => a.localeCompare(b));
  const claims = new Map(limits.map(([capability, limit]) => [
    capability, { id: capability.replace(/^@hypit\//u, "").replaceAll("/", "."), limit },
  ]));
  const environment = await openLocalExecutionEnvironment({
    title: "HypiHub",
    dataRoot: dataRoot ?? join(nodeHypitDataRoot(), "execution", "hypihub"),
    capacities: { account: accountConcurrency, ...Object.fromEntries([...claims.values()].map(claim => [claim.id, claim.limit])) },
    endpoints: selected.map(endpoint => {
      const model = claims.get(endpoint.capability.id);
      return { endpoint, claims: model === undefined ? ["account"] : ["account", model.id] };
    }),
  });
  return {
    projection: environment.projection,
    connect: () => environment.connect(),
    close: () => environment.close(),
    doctor: (capability, signal) => {
      if (capability !== undefined && !configured.has(capability)) {
        return Promise.resolve([{ severity: "error", code: "capability-unselected",
          message: `Environment ${environment.projection.id} does not offer ${capability}.` }]);
      }
      return hypihub.doctor(capability === undefined ? [...configured] : [capability], signal);
    },
  };
}

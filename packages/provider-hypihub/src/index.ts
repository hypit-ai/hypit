import { HypiHubClient, type HypiHubOptions } from "./client.js";
import { hypiHubDirect } from "./direct.js";
import { hypiHubJobs } from "./routes.js";
import type { Offering, ReportOffering } from "./catalog.js";
import { diagnoseHypiHub } from "./diagnostics.js";

export type { HypiHubOptions } from "./client.js";
export type { HypiHubAuthentication, HypiHubCredentialSource } from "./authentication.js";
export * from "./oauth.js";

/** Bind all implemented model contracts to the configured HypiHub account. */
export function createHypiHubEndpoints(options: HypiHubOptions) {
  return createHypiHubProvider(options).endpoints;
}

export function createHypiHubProvider(options: HypiHubOptions) {
  const client = new HypiHubClient(options);
  const offerings = new Map<string, readonly Offering[]>();
  const report: ReportOffering = (id, models) => { offerings.set(id, models); };
  return {
    endpoints: [...hypiHubJobs(options.id, client, report), ...hypiHubDirect(options.id, client, report)],
    doctor: (capabilities: readonly string[], signal: AbortSignal) => diagnoseHypiHub(client, offerings, capabilities, signal),
  };
}

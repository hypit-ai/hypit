import type { ExecutionFinding } from "@hypit/execution";
import type { Offering } from "./catalog.js";
import { record, type HypiHubClient } from "./client.js";
import { HypiHubHttpError } from "./errors.js";

export async function diagnoseHypiHub(
  client: HypiHubClient, offerings: ReadonlyMap<string, readonly Offering[]>, capabilities: readonly string[],
  signal: AbortSignal,
): Promise<readonly ExecutionFinding[]> {
  let access;
  try { access = await client.inspectAccess(); }
  catch {
    return [{ severity: "error", code: "credential-unreadable", message: "Could not read the selected HypiHub credential." }];
  }
  if (access === undefined) {
    return [{ severity: "warning", code: "credential-unchecked", message: "The credential source does not expose a read-only check." }];
  }
  if (access.status !== "connected") {
    const facts = {
      disconnected: ["credential-missing", "Connect the HypiHub account."],
      "needs-refresh": ["credential-needs-refresh", "The HypiHub credential needs renewal."],
      reconnect: ["credential-needs-reconnect", "Connect the HypiHub account again."],
    } as const;
    const [code, issue] = facts[access.status];
    return [{ severity: access.status === "needs-refresh" ? "warning" : "error", code,
      message: `${issue} Account catalogue check skipped.` }];
  }

  let catalogue;
  try {
    catalogue = await client.inspectCatalogue(access.token, AbortSignal.any([signal, AbortSignal.timeout(12_000)]));
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof HypiHubHttpError && (error.status === 401 || error.status === 403)) {
      return [{ severity: "error", code: "credential-rejected", message: "HypiHub rejected the selected credential." }];
    }
    return [{ severity: "error", code: "provider-unavailable", message: "Could not read the HypiHub account catalogue." }];
  }
  if (!Array.isArray(catalogue.data)) {
    return [{ severity: "error", code: "catalogue-invalid", message: "HypiHub returned an invalid model catalogue." }];
  }
  const cards = new Map<string, ReadonlySet<unknown>>();
  for (const value of catalogue.data) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const card = record(value, "model card");
    const operations = new Set(Array.isArray(card.endpoints) ? card.endpoints : []);
    for (const key of [card.id, card.canonical_name, ...(Array.isArray(card.aliases) ? card.aliases : [])]) {
      if (typeof key === "string") cards.set(key, operations);
    }
  }
  const findings: ExecutionFinding[] = [{ severity: "info", code: "credential-accepted", message: "HypiHub account catalogue is available." }];
  for (const capability of capabilities) {
    const expected = offerings.get(capability) ?? [];
    const missing = expected.filter(offer => !cards.get(offer.model)?.has(offer.operation));
    if (missing.length === 0) continue;
    findings.push({ severity: missing.length === expected.length ? "error" : "warning", code: "model-offering-unavailable",
      message: `${capability} lacks ${missing.map(({ model, operation }) => `${model} (${operation})`).join(", ")}.` });
  }
  return findings;
}

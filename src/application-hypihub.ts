import { randomUUID } from "node:crypto";
import {
  bindApplicationExecutionEnvironment, openApplicationExecutionDirectory,
  type ApplicationAuthorizationAttempt, type ApplicationExecutionAuthorization,
} from "@hypit/application";
import { openNodeHypiHubEnvironment } from "./execution-node.js";
import { beginNodeHypiHubAuthorization, openNodeHypiHubOAuthConnection, type NodeHypiHubAuthorization } from "./hypihub-auth-node.js";
import type { HypiHubOAuthConnection } from "@hypit/provider-hypihub";

function authorization(connection: HypiHubOAuthConnection): ApplicationExecutionAuthorization {
  let attempt: { readonly transport: NodeHypiHubAuthorization; observation: ApplicationAuthorizationAttempt } | undefined;
  let starting = false;
  let closed = false;
  function selected(id: string) {
    if (attempt?.observation.id !== id) throw new Error("Unknown HypiHub authorization attempt.");
    return attempt;
  }
  return {
    status: () => connection.status(),
    disconnect: () => connection.disconnect(),
    async begin(manual) {
      if (closed || starting || attempt?.observation.state === "pending") {
        throw new Error("An authorization attempt is already open or its host is closing.");
      }
      starting = true;
      try {
        if ((await connection.status()).status !== "disconnected") {
          throw new Error("Disconnect the current HypiHub credential before authorizing this slot.");
        }
        const transport = await beginNodeHypiHubAuthorization(connection, { manual });
        if (closed) { transport.cancel(); throw new Error("The authorization host is closing."); }
        const base = { id: randomUUID(), authorizationUrl: transport.authorizationUrl, expiresAt: transport.expiresAt };
        const entry: NonNullable<typeof attempt> = { transport, observation: { ...base, state: "pending" } };
        attempt = entry;
        void transport.result.then(
          status => { entry.observation = { ...base, state: "complete", connection: status }; },
          error => { entry.observation = { ...base, state: "failed", error: error instanceof Error ? error.message : "HypiHub authorization failed." }; },
        );
        return entry.observation;
      } finally {
        starting = false;
      }
    },
    observe: id => selected(id).observation,
    async complete(id, proof) {
      const entry = selected(id);
      if (entry.observation.state === "pending") await entry.transport.submit(proof);
      return entry.observation;
    },
    cancel: id => { selected(id).transport.cancel(); },
    close() { closed = true; attempt?.transport.cancel(); },
  };
}

/** Compose the user-level HypiHub account and durable Environment once in the local distribution. */
export async function openLocalApplicationExecution({
  credential = openNodeHypiHubOAuthConnection(), ...options
}: { readonly credential?: HypiHubOAuthConnection; readonly dataRoot?: string;
  readonly fetch?: typeof globalThis.fetch; readonly capabilities?: readonly string[] } = {}) {
  const environment = await openNodeHypiHubEnvironment({ ...options, credential, baseUrl: credential.origin });
  return openApplicationExecutionDirectory([
    bindApplicationExecutionEnvironment(environment, () => true, { authorization: authorization(credential) }),
  ]);
}

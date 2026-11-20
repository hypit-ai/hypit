import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { NodeExecutionHostClient, openNodeExecutionHost, type NodeExecutionDeployment } from "@hypit/execution/node";
import type { ProjectExecutionClient, ProjectExecutionDiscovery } from "@hypit/project";
import type { OpenNodeHypiHubOAuthConnectionOptions } from "./hypihub-auth-node.js";
import { findLocalServiceEndpoint, readLocalServiceEndpoint, reserveLocalServiceEndpoint, waitForLocalService, type LocalServiceEndpointOptions } from "./local-endpoint.js";

export async function startLocalExecution(options: LocalServiceEndpointOptions & {
  readonly port: number;
  readonly dataRoot?: string;
  readonly oauth?: OpenNodeHypiHubOAuthConnectionOptions;
}) {
  const deadline = Date.now() + 8_000;
  let reservation;
  do {
    const existing = await findLocalServiceEndpoint("execution", options);
    if (existing !== undefined) {
      if (options.dataRoot !== undefined) throw new Error("Choose a separate --endpoint-file to start another Execution deployment.");
      return { endpoint: existing };
    }
    reservation = await reserveLocalServiceEndpoint("execution", options);
    if (reservation !== undefined) break;
    await delay(randomInt(50, 120));
  } while (Date.now() < deadline);
  if (reservation === undefined) throw new Error("Execution Host startup is busy.");

  let deployment: NodeExecutionDeployment | undefined;
  let server: ReturnType<typeof openNodeExecutionHost> | undefined;
  try {
    const { openLocalHypiHubDeployment } = await import("./execution-hypihub.js");
    const credential = options.oauth === undefined ? undefined
      : (await import("./hypihub-auth-node.js")).openNodeHypiHubOAuthConnection(options.oauth);
    deployment = await openLocalHypiHubDeployment({
      ...(options.dataRoot === undefined ? {} : { dataRoot: options.dataRoot }),
      ...(credential === undefined ? {} : { credential }),
    });
    server = openNodeExecutionHost({ environments: [deployment], port: options.port, closeDeployments: true });
    const selected = server;
    const { endpoint } = await reservation.publish(await selected.listen());
    return { endpoint, close: async () => {
      try { await selected.close(); }
      finally { await reservation.close(); }
    } };
  } catch (error) {
    try {
      if (server !== undefined) await server.close();
      else {
        deployment?.authorization?.close();
        await deployment?.environment.close();
      }
    } finally { await reservation.close(); }
    throw error;
  }
}

export async function connectLocalExecution(options: LocalServiceEndpointOptions, signal?: AbortSignal) {
  const found = await findLocalServiceEndpoint("execution", options);
  if (found === undefined) {
    if (options.path !== undefined) throw new Error(`No Execution Host is available at ${options.path}.`);
    const entry = fileURLToPath(new URL("./cli.js", import.meta.url));
    const child = spawn(process.execPath, [entry, "execution", "start"], { detached: true, stdio: "ignore", windowsHide: true });
    const failed = new Promise<never>((_resolve, reject) => { child.once("error", reject); });
    child.unref();
    await Promise.race([failed, waitForLocalService("execution", options, signal)]);
  }
  return localExecutionClient(options);
}

function localExecutionClient(options: LocalServiceEndpointOptions): NodeExecutionHostClient {
  return new NodeExecutionHostClient(async () => {
    const endpoint = await readLocalServiceEndpoint("execution", options);
    if (endpoint === undefined) throw new Error("Execution Host is stopped. Start the selected deployment to reopen its Invocations.");
    return endpoint;
  });
}

/** Discover the selected deployment on demand without starting it from an authoring process. */
export function discoverLocalExecution(options: LocalServiceEndpointOptions): ProjectExecutionDiscovery {
  const host = localExecutionClient(options);
  return async (known, lifetime) => {
    const signal = AbortSignal.any([lifetime, AbortSignal.timeout(1_500)]);
    const clients: ProjectExecutionClient[] = [];
    try {
      const available = (await host.environments(signal)).map(value => value.id);
      for (const id of available) {
        if (known.has(id)) continue;
        const environment = await host.environment(id, signal);
        const lease = environment.connect();
        clients.push({ environment: id, client: lease.client, close: async () => {
          try { await lease.close(); }
          finally { await environment.close(); }
        } });
      }
      return { available, clients };
    } catch {
      await Promise.allSettled(clients.map(client => client.close()));
      lifetime.throwIfAborted();
      return { available: [], clients: [] };
    }
  };
}

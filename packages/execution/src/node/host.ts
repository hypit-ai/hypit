import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream/promises";
import { InvocationIdentityConflict, type ExecutionEnvironment, type InvocationRequest, type QuoteInputs } from "../index.js";
import type { ExecutionAuthorization } from "./authorization.js";
import { invocationContentType, readExecutionJson, readInvocationUpload } from "./transport.js";
import { identity, object } from "./values.js";

export type NodeExecutionDeployment = {
  readonly environment: ExecutionEnvironment;
  readonly authorization?: ExecutionAuthorization;
};

export type NodeExecutionHostOptions = {
  readonly environments: readonly NodeExecutionDeployment[];
  readonly closeDeployments?: boolean;
  readonly port?: number;
};

type Reply = { readonly status: number; readonly value: unknown };

function send(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value) + "\n");
}

export function openNodeExecutionHost(options: NodeExecutionHostOptions) {
  const deployments = new Map<string, NodeExecutionDeployment>();
  for (const deployment of options.environments) {
    const id = identity(deployment.environment.projection.id, "Environment id");
    if (deployments.has(id)) throw new Error(`Execution Host repeats Environment ${id}.`);
    deployments.set(id, deployment);
  }
  const instance = `execution_${randomUUID()}`;
  const token = randomBytes(32).toString("base64url");
  const stop = new AbortController();

  async function route(request: IncomingMessage, response: ServerResponse, signal: AbortSignal): Promise<Reply | undefined> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const { method } = request;
    if (url.pathname === "/" && method === "GET") return { status: 200, value: { service: "hypit.execution", instance } };
    if (request.headers.authorization !== `Bearer ${token}`) {
      return { status: 401, value: { error: "Execution Host authorization is required." } };
    }
    if (url.pathname === "/api/execution" && method === "GET") {
      return { status: 200, value: [...deployments.values()].map(({ environment }) => environment.projection) };
    }
    const prefix = "/api/execution/";
    if (!url.pathname.startsWith(prefix)) return { status: 404, value: { error: "Unknown Execution route." } };
    const [idPath, operation, detail, action, output, resource, ...extra] = url.pathname.slice(prefix.length).split("/");
    if (!idPath || extra.length > 0 || ((output !== undefined || resource !== undefined) && action !== "resources")) {
      return { status: 404, value: { error: "Unknown Execution route." } };
    }
    const id = decodeURIComponent(idPath);
    const deployment = deployments.get(id);
    if (deployment === undefined) return { status: 404, value: {
      code: "environment-unavailable", error: `Execution Environment ${id} is unavailable on this deployment.`,
    } };
    const { environment } = deployment;
    const body = async () => {
      if (request.headers["content-type"] !== "application/json") throw new Error("Execution request requires application/json.");
      return await readExecutionJson(request.iterator({ destroyOnReturn: false }));
    };
    if (operation === "auth") {
      const auth = deployment.authorization;
      if (auth === undefined) throw new Error(`Environment ${id} does not expose account authorization.`);
      if (detail === undefined && method === "GET") return { status: 200, value: await auth.status() };
      if (detail === undefined && method === "DELETE") {
        await auth.disconnect();
        return { status: 200, value: await auth.status() };
      }
      if (detail === "attempt" && action === undefined && method === "POST") {
        const { manual } = object(await body(), "Authorization request", ["manual"]);
        if (typeof manual !== "boolean") throw new Error("Authorization requires a manual mode selection.");
        return { status: 201, value: await auth.begin(manual) };
      }
      if (detail === "attempt" && action !== undefined) {
        const attempt = decodeURIComponent(action);
        if (method === "GET") return { status: 200, value: auth.observe(attempt) };
        if (method === "DELETE") {
          auth.cancel(attempt);
          return { status: 200, value: auth.observe(attempt) };
        }
        if (method === "POST") {
          const { proof } = object(await body(), "Authorization proof", ["proof"]);
          if (typeof proof !== "string" || proof.length > 2048) throw new Error("Invalid authorization proof.");
          return { status: 200, value: await auth.complete(attempt, proof) };
        }
      }
      return { status: 404, value: { error: "Unknown Execution authorization route." } };
    }

    if (operation === "doctor" && detail === undefined && method === "GET") {
      if (environment.doctor === undefined) throw new Error(`Environment ${id} does not expose diagnostics.`);
      return { status: 200, value: { environment: environment.projection,
        findings: await environment.doctor(url.searchParams.get("capability") ?? undefined, signal) } };
    }

    const lease = environment.connect();
    try {
      const { client } = lease;
      if (operation === undefined && method === "GET") {
        return { status: 200, value: { projection: environment.projection, capabilities: client.capabilities() } };
      }
      if (operation === "quote" && detail === undefined && method === "POST") {
        const payload = object(await body(), "Execution quote", ["request", "inputs"]);
        return { status: 200, value: await client.quote(payload.request as InvocationRequest,
          { inputs: (payload.inputs ?? {}) as QuoteInputs, signal }) };
      }
      if (operation === "invocations" && detail === undefined && method === "POST") {
        if (request.headers["content-type"] !== invocationContentType) throw new Error("Execution submission requires a framed upload.");
        const stream = request.iterator({ destroyOnReturn: false });
        try {
          const { request: invocation, ...options } = await readInvocationUpload(stream);
          return { status: 202, value: await client.start(invocation, { ...options, signal }) };
        } finally {
          await stream.return?.();
        }
      }
      if (operation === "invocations" && detail !== undefined) {
        const address = { environment: id, invocation: decodeURIComponent(detail) };
        if (action === "cancel" && method === "POST") return { status: 200, value: await client.cancel(address) };
        if ((action === "publication" || action === undefined) && method === "GET") {
          const result = action === "publication" ? await client.publication(address) : await client.get(address);
          return result === undefined ? { status: 404, value: { error: "Requested Invocation or Publication is unavailable." } }
            : { status: 200, value: result };
        }
        if (action === "resources" && output !== undefined && resource !== undefined && (method === "GET" || method === "HEAD")) {
          const publication = await client.publication(address);
          const namedOutput = identity(decodeURIComponent(output), "Publication output");
          const namedResource = identity(decodeURIComponent(resource), "Publication resource");
          if (!publication || !Object.hasOwn(publication.outputs, namedOutput)
            || !Object.hasOwn(publication.outputs[namedOutput]!.resources, namedResource)) {
            return { status: 404, value: { error: "Requested Publication resource is unavailable." } };
          }
          const source = await client.openResource(address, namedOutput, namedResource);
          response.writeHead(200, { "content-type": source.mediaType, "cache-control": "no-store",
            "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox",
            ...(source.size === undefined ? {} : { "content-length": source.size }) });
          if (method === "HEAD") response.end();
          else await pipeline(source.bytes, response, { signal });
          return undefined;
        }
      }
      return { status: 404, value: { error: "Unknown Execution route." } };
    } finally {
      await lease.close();
    }
  }

  const server = createServer(async (request, response) => {
    const disconnected = new AbortController();
    response.once("close", () => disconnected.abort());
    try {
      const reply = await route(request, response, AbortSignal.any([stop.signal, disconnected.signal]));
      if (reply !== undefined && !response.destroyed) send(response, reply.status, reply.value);
    } catch (error) {
      if (response.destroyed) return;
      if (response.headersSent) response.destroy();
      else if (error instanceof InvocationIdentityConflict) send(response, 409, { error: error.message, code: "invocation-conflict" });
      else send(response, 400, { error: error instanceof Error ? error.message : String(error) });
    } finally {
      request.resume();
    }
  });
  let listening: Promise<{ origin: string; token: string; instance: string }> | undefined;
  let closing: Promise<void> | undefined;
  return {
    listen() {
      if (closing !== undefined) throw new Error("Execution Host is closing.");
      return listening ??= new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port ?? 0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve({ origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token, instance });
        });
      });
    },
    close() {
      return closing ??= (async () => {
        stop.abort();
        await listening?.catch(() => undefined);
        try {
          if (server.listening) {
            const stopped = new Promise<void>((resolve, reject) => {
              server.close(error => error === undefined ? resolve() : reject(error));
            });
            server.closeAllConnections();
            await stopped;
          }
        } finally {
          if (options.closeDeployments) {
            const results = await Promise.allSettled(options.environments.flatMap(({ authorization, environment }) => [
              Promise.resolve().then(() => authorization?.close()), Promise.resolve().then(() => environment.close()),
            ]));
            const failure = results.find(result => result.status === "rejected");
            if (failure !== undefined) throw failure.reason;
          }
        }
      })();
    },
  };
}

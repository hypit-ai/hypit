import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { setTimeout as delay } from "node:timers/promises";
import {
  InvocationIdentityConflict, type ExecutionCapabilityProjection, type ExecutionClient, type ExecutionEnvironment,
  type ExecutionFinding, type InvocationAddress, type InvocationObservation, type Publication,
} from "../index.js";
import { encodeInvocation, invocationContentType } from "./transport.js";

type Destination = { readonly origin: string; readonly token: string };
export type NodeExecutionHostDestination = Destination | (() => Promise<Destination>);

function localDestination(endpoint: Destination): Destination {
  const origin = new URL(endpoint.origin);
  if (origin.origin !== endpoint.origin || origin.protocol !== "http:" || origin.hostname !== "127.0.0.1") {
    throw new Error("Execution Host requires a local loopback origin.");
  }
  return { origin: origin.origin, token: endpoint.token };
}
type RequestOptions = { readonly method?: string; readonly body?: unknown; readonly signal?: AbortSignal };
type EnvironmentDescription = {
  readonly projection: ExecutionEnvironment["projection"];
  readonly capabilities: readonly ExecutionCapabilityProjection[];
};

export class ExecutionHostError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

export class NodeExecutionHostClient {
  readonly #endpoint: NodeExecutionHostDestination;

  constructor(endpoint: NodeExecutionHostDestination) {
    this.#endpoint = typeof endpoint === "function" ? endpoint : localDestination(endpoint);
  }

  path(environment: string) { return `/api/execution/${encodeURIComponent(environment)}`; }

  async #send(path: string, options: RequestOptions, upload?: ReturnType<typeof encodeInvocation>) {
    options.signal?.throwIfAborted();
    const endpoint = typeof this.#endpoint === "function" ? localDestination(await this.#endpoint()) : this.#endpoint;
    const url = new URL(path, endpoint.origin);
    if (url.origin !== endpoint.origin) throw new Error("Execution request left the Host origin.");
    const headers = { authorization: `Bearer ${endpoint.token}` };
    const body = upload === undefined
      ? options.body === undefined ? {} : { body: JSON.stringify(options.body), headers: { ...headers, "content-type": "application/json" } }
      : { body: Readable.toWeb(Readable.from(upload)) as ReadableStream<Uint8Array>, duplex: "half" as const,
          headers: { ...headers, "content-type": invocationContentType } };
    const response = await fetch(url, { method: options.method ?? "GET", redirect: "error", headers,
      ...body, ...(options.signal === undefined ? {} : { signal: options.signal }) });
    if (!response.ok) {
      const error = await response.json().catch(() => undefined) as { error?: string; code?: string } | undefined;
      throw new ExecutionHostError(error?.error ?? `Execution Host returned HTTP ${response.status}.`, response.status, error?.code);
    }
    return response;
  }

  async request<Result>(path: string, options: RequestOptions = {}): Promise<Result> {
    return await (await this.#send(path, options)).json() as Result;
  }

  environments(signal?: AbortSignal): Promise<readonly ExecutionEnvironment["projection"][]> {
    return this.request("/api/execution", signal === undefined ? {} : { signal });
  }

  async selectEnvironment(id?: string, signal?: AbortSignal): Promise<string> {
    if (id !== undefined) return id;
    const environments = await this.environments(signal);
    if (environments.length !== 1) throw new Error(`Choose an Execution Environment by id (${environments.map(value => value.id).join(", ") || "none available"}).`);
    return environments[0]!.id;
  }

  async environment(id: string, signal?: AbortSignal): Promise<ExecutionEnvironment> {
    const base = this.path(id);
    const { projection, capabilities } = await this.request<EnvironmentDescription>(base, signal === undefined ? {} : { signal });
    if (projection.id !== id) throw new Error(`Execution Host returned a different Environment for ${id}.`);
    const deployment = new AbortController();
    const path = (address: InvocationAddress) => {
      if (address.environment !== id) throw new Error("Invocation address belongs to a different Environment.");
      return `${base}/invocations/${encodeURIComponent(address.invocation)}`;
    };
    return {
      projection,
      doctor: async (capability, signal) => {
        const query = capability === undefined ? "" : `?capability=${encodeURIComponent(capability)}`;
        return (await this.request<{ readonly findings: readonly ExecutionFinding[] }>(base + "/doctor" + query,
          { signal: AbortSignal.any([deployment.signal, signal]) })).findings;
      },
      close: () => deployment.abort(new Error("Execution connection is closed.")),
      connect: () => {
        deployment.signal.throwIfAborted();
        const lease = new AbortController();
        const lifetime = AbortSignal.any([deployment.signal, lease.signal]);
        const scoped = (signal?: AbortSignal) => signal === undefined ? lifetime : AbortSignal.any([lifetime, signal]);
        const read = async <Result>(url: string, signal = lifetime): Promise<Result | undefined> => {
          try { return await this.request<Result>(url, { signal }); }
          catch (error) {
            if (error instanceof ExecutionHostError && error.status === 404 && error.code !== "environment-unavailable") return undefined;
            throw error;
          }
        };
        const client: ExecutionClient = {
          environment: id,
          capabilities: () => { lifetime.throwIfAborted(); return structuredClone(capabilities); },
          quote: (request, options) => this.request(base + "/quote",
            { method: "POST", body: { request, inputs: options?.inputs }, signal: scoped(options?.signal) }),
          start: async (request, options) => {
            try {
              const response = await this.#send(base + "/invocations", { method: "POST", signal: scoped(options?.signal) },
                encodeInvocation(request, options?.invocation, options?.inputs ?? {}));
              return await response.json() as InvocationAddress;
            } catch (error) {
              if (error instanceof ExecutionHostError && error.code === "invocation-conflict" && options?.invocation !== undefined) {
                throw new InvocationIdentityConflict({ environment: id, invocation: options.invocation });
              }
              throw error;
            }
          },
          get: address => read(path(address)),
          wait: async (address, options) => {
            const signal = scoped(options?.signal);
            while (true) {
              const observation = await read<InvocationObservation>(path(address), signal);
              if (observation === undefined) throw new Error(`Unknown Invocation ${address.invocation}.`);
              if (["complete", "failed", "cancelled"].includes(observation.phase)) return observation;
              await delay(500, undefined, { signal });
            }
          },
          cancel: address => this.request(path(address) + "/cancel", { method: "POST", signal: lifetime }),
          publication: address => read(path(address) + "/publication"),
          openResource: async (address, output, resource) => {
            const publication = await read<Publication>(path(address) + "/publication");
            const outputs = publication?.outputs;
            const resources = outputs && Object.hasOwn(outputs, output) ? outputs[output]!.resources : undefined;
            const metadata = resources && Object.hasOwn(resources, resource) ? resources[resource] : undefined;
            if (metadata === undefined) throw new Error(`Unknown Publication resource ${output}/${resource}.`);
            const url = path(address) + `/resources/${encodeURIComponent(output)}/${encodeURIComponent(resource)}`;
            const send = this.#send.bind(this);
            return { mediaType: metadata.mediaType, size: metadata.size, bytes: (async function* () {
              const response = await send(url, { signal: lifetime });
              if (response.body === null) throw new Error("Execution Host returned an empty response stream.");
              yield* Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>);
            })() };
          },
        };
        return { client, close: () => lease.abort(new Error("Execution client lease is closed.")) };
      },
    };
  }
}

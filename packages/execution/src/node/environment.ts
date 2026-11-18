import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import type {
  ExecutionClient, ExecutionClientLease, ExecutionEnvironment, ExecutionQuote, ExecutionResourceSource, InvocationAddress,
  InvocationFailure, InvocationRequest, Publication, PublicationResource, QuoteInputs,
} from "../index.js";
import type {
  ProviderCollection, ProviderContext, ProviderDirectEndpoint, ProviderEndpoint, ProviderOutputWriter,
  ProviderPending, ProviderReceipt, ProviderSubmission,
} from "../provider.js";
import { invocationId, observe, readInvocation, readPublication, readReceipt, terminal, type InvocationRecord } from "./records.js";
import { InvocationStorage, lockEnvironment, openStoredResource, stageResource } from "./storage.js";
import { identity, integer, json, object, text } from "./values.js";

export type LocalEndpointBinding = {
  readonly endpoint: ProviderEndpoint;
  /** Shared occupancy budgets used by this Endpoint, such as its account and model. */
  readonly claims?: readonly string[];
};

export type LocalExecutionEnvironmentOptions = {
  readonly id: string;
  readonly title: string;
  /** Dedicated directory for this Environment, on the local filesystem. */
  readonly dataRoot: string;
  readonly capacities?: Readonly<Record<string, number>>;
  readonly endpoints: readonly LocalEndpointBinding[];
};

type BoundEndpoint = { readonly endpoint: ProviderEndpoint; readonly claims: readonly string[] };
type StartOptions = NonNullable<Parameters<ExecutionClient["start"]>[1]>;

function availableResource(
  resources: Readonly<Record<string, PublicationResource>>, name: string,
): PublicationResource {
  if (!Object.hasOwn(resources, name)) throw new Error(`Unknown Execution resource ${name}.`);
  return resources[name]!;
}

function pending(result: ProviderPending): Pick<InvocationRecord, "wakeAt" | "progress"> {
  const delay = integer(result.retryAfterMs, "Provider retry delay", 1);
  return { wakeAt: Date.now() + Math.min(delay, 2_147_483_647),
    ...(result.progress === undefined ? {} : { progress: result.progress }) };
}

const unknownSubmission = {
  code: "submission-unknown",
  message: "The Provider outcome is unknown. Check the Provider before submitting another Invocation.",
};

class LocalExecutionEnvironment implements ExecutionEnvironment {
  readonly projection: ExecutionEnvironment["projection"];
  readonly #bindings: readonly BoundEndpoint[];
  readonly #capacity: ReadonlyMap<string, number>;
  readonly #storage: InvocationStorage;
  readonly #unlock: () => void;
  readonly #records: Map<string, InvocationRecord>;
  readonly #tasks = new Map<string, Promise<void>>();
  readonly #requests = new Set<Promise<unknown>>();
  readonly #mutations = new Map<string, Promise<unknown>>();
  readonly #faults = new Map<string, Error>();
  readonly #wakes = new Map<string, AbortController>();
  readonly #waiters = new Map<string, Set<() => void>>();
  readonly #stop = new AbortController();
  #closePromise: Promise<void> | undefined;

  constructor(
    options: LocalExecutionEnvironmentOptions, bindings: readonly BoundEndpoint[], capacity: ReadonlyMap<string, number>,
    storage: InvocationStorage, unlock: () => void, records: readonly InvocationRecord[],
  ) {
    this.projection = Object.freeze({ id: options.id, kind: "local", title: options.title });
    this.#bindings = bindings;
    this.#capacity = capacity;
    this.#storage = storage;
    this.#unlock = unlock;
    this.#records = new Map(records.map(record => [record.address.invocation, record]));
    this.#drain();
  }

  connect(): ExecutionClientLease {
    this.#stop.signal.throwIfAborted();
    const lease = new AbortController();
    const signal = AbortSignal.any([lease.signal, this.#stop.signal]);
    const check = () => signal.throwIfAborted();
    return {
      close: () => lease.abort(new Error("Execution client lease is closed.")),
      client: {
        environment: this.projection.id,
        capabilities: () => { check(); return this.#capabilities(); },
        quote: async (request, options) => {
          check();
          return await this.#track(this.#quote(request, options?.inputs ?? {}, options?.signal === undefined
            ? signal : AbortSignal.any([signal, options.signal])));
        },
        start: async (request, options) => {
          check();
          return await this.#track(this.#start(request, { ...options, signal: options?.signal === undefined
            ? signal : AbortSignal.any([signal, options.signal]) }));
        },
        get: async address => { check(); const record = this.#get(address); return record && observe(record); },
        wait: (address, options) => this.#wait(address, options?.signal === undefined
          ? signal : AbortSignal.any([signal, options.signal])),
        cancel: async address => { check(); return await this.#track(this.#cancel(address)); },
        publication: async address => { check(); return await this.#publication(address); },
        openResource: async (address, output, name) => {
          check();
          const publication = await this.#publication(address);
          if (publication === undefined || !Object.hasOwn(publication.outputs, output)) {
            throw new Error(`Publication output ${output} is unavailable for Invocation ${address.invocation}.`);
          }
          const resource = availableResource(publication.outputs[output]!.resources, name);
          return openStoredResource(join(this.#storage.directory(address.invocation), "publication"), resource);
        },
      },
    };
  }

  close(): Promise<void> {
    this.#closePromise ??= (async () => {
      this.#stop.abort(new Error("Execution Environment is closed."));
      try { await Promise.allSettled([...this.#requests, ...this.#tasks.values()]); }
      finally { this.#unlock(); }
    })();
    return this.#closePromise;
  }

  #track<T>(task: Promise<T>): Promise<T> {
    this.#requests.add(task);
    const forget = () => this.#requests.delete(task);
    void task.then(forget, forget);
    return task;
  }

  #capabilities(): ReturnType<ExecutionClient["capabilities"]> {
    const entries = new Map<string, { capability: string; title: string; endpoints: string[] }>();
    for (const { endpoint } of this.#bindings) {
      const { id: capability, title } = endpoint.capability;
      const entry = entries.get(capability);
      if (entry === undefined) entries.set(capability, { capability, title, endpoints: [endpoint.id] });
      else entry.endpoints.push(endpoint.id);
    }
    return [...entries.values()];
  }

  #get(address: InvocationAddress): InvocationRecord | undefined {
    object(address, "Invocation address", ["environment", "invocation"]);
    if (address.environment !== this.projection.id) throw new Error("Invocation address belongs to a different Environment.");
    return this.#records.get(invocationId(address.invocation));
  }

  #required(address: InvocationAddress): InvocationRecord {
    const record = this.#get(address);
    if (record === undefined) throw new Error(`Unknown Invocation ${address.invocation}.`);
    return record;
  }

  async #publication(address: InvocationAddress): Promise<Publication | undefined> {
    const record = this.#get(address);
    if (record?.phase !== "complete") return undefined;
    const publication = await this.#storage.publication(record.address);
    if (publication === undefined || publication.capability !== record.capability) {
      throw new Error(`Invocation ${record.address.invocation} has no matching Publication manifest.`);
    }
    return publication;
  }

  #prepare(request: InvocationRequest, inputs: QuoteInputs) {
    object(request, "Invocation request", ["capability", "input", "endpoint"]);
    const capability = text(request.capability, "Capability id");
    const endpointId = request.endpoint === undefined ? undefined : identity(request.endpoint, "Endpoint id");
    const eligible = this.#bindings.filter(({ endpoint }) => endpoint.capability.id === capability
      && (endpointId === undefined || endpoint.id === endpointId));
    if (eligible.length !== 1) {
      throw new Error(eligible.length === 0 ? `No Endpoint for Capability ${capability}${endpointId === undefined ? "" : ` at ${endpointId}`}.`
        : `Select an Endpoint for Capability ${capability}: ${eligible.map(item => item.endpoint.id).join(", ")}.`);
    }
    const { endpoint, claims } = eligible[0]!;
    const input = json(endpoint.capability.readRequest(json(request.input, "Invocation input")), "Invocation input");
    endpoint.capability.checkInputs?.(input, inputs);
    endpoint.check?.(input, inputs);
    return { endpoint, claims, capability, input };
  }

  async #quote(request: InvocationRequest, sourceMetadata: QuoteInputs, signal: AbortSignal): Promise<ExecutionQuote> {
    signal.throwIfAborted();
    const inputs = Object.fromEntries(Object.entries(object(sourceMetadata, "Quote inputs")).map(([name, raw]) => {
      identity(name, "Input resource name");
      const value = object(raw, "Quote input", ["mediaType", "size", "durationSeconds"]);
      const mediaType = text(value.mediaType, "Input media type");
      const size = value.size === undefined ? undefined : integer(value.size, "Input size", 0);
      const durationSeconds = value.durationSeconds;
      if (durationSeconds !== undefined && (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
        throw new Error("Input durationSeconds is invalid.");
      }
      return [name, { mediaType, ...(size === undefined ? {} : { size }),
        ...(durationSeconds === undefined ? {} : { durationSeconds }) }];
    }));
    const { endpoint, capability, input } = this.#prepare(request, inputs);
    const result = await endpoint.quote?.(input, inputs, signal)
      ?? { kind: "unavailable" as const, reason: "This Endpoint does not publish a quote." };
    return { ...result, environment: this.projection.id, capability, endpoint: endpoint.id };
  }

  async #start(request: InvocationRequest, options: StartOptions): Promise<InvocationAddress> {
    const signal = options.signal ?? this.#stop.signal;
    signal.throwIfAborted();
    const sources = Object.entries(options.inputs ?? {});
    const metadata = Object.fromEntries(sources.map(([name, source]) => {
      identity(name, "Input resource name");
      const mediaType = text(source.mediaType, "Input media type");
      const size = source.size === undefined ? undefined : integer(source.size, "Input size", 0);
      return [name, { mediaType, ...(size === undefined ? {} : { size }) }];
    }));
    const { endpoint, claims, capability, input } = this.#prepare(request, metadata);
    const address = { environment: this.projection.id, invocation: randomUUID() };
    const stage = await this.#storage.incoming();
    try {
      const inputs: [string, PublicationResource][] = [];
      for (const [index, [name, source]] of sources.entries()) {
        inputs.push([name, await stageResource(stage, `inputs/${index}.bin`, source, signal)]);
      }
      const staged = Object.fromEntries(inputs);
      endpoint.capability.checkInputs?.(input, staged);
      endpoint.check?.(input, staged);
      signal.throwIfAborted();
      const now = new Date().toISOString();
      const record: InvocationRecord = {
        format: "hypit.invocation", address, capability, endpoint: endpoint.id, phase: "queued",
        createdAt: now, updatedAt: now, request: input, inputs: staged, claims,
      };
      await this.#storage.create(record, stage);
      this.#records.set(address.invocation, record);
      this.#drain();
      return { ...address };
    } finally { await rm(stage, { recursive: true, force: true }); }
  }

  async #wait(address: InvocationAddress, signal: AbortSignal): Promise<ReturnType<typeof observe>> {
    while (true) {
      signal.throwIfAborted();
      const record = this.#required(address);
      if (terminal(record)) return observe(record);
      const fault = this.#faults.get(record.address.invocation);
      if (fault !== undefined) throw fault;
      await new Promise<void>((resolve, reject) => {
        const id = record.address.invocation;
        const listeners = this.#waiters.get(id) ?? new Set();
        const clear = () => {
          signal.removeEventListener("abort", abort);
          listeners.delete(changed);
          if (listeners.size === 0) this.#waiters.delete(id);
        };
        const changed = () => { clear(); resolve(); };
        const abort = () => { clear(); reject(signal.reason); };
        listeners.add(changed);
        this.#waiters.set(id, listeners);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  }

  #notify(id: string): void {
    for (const changed of this.#waiters.get(id) ?? []) changed();
  }

  #update(id: string, update: (current: InvocationRecord) => InvocationRecord): Promise<InvocationRecord> {
    const task = (this.#mutations.get(id) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const current = this.#records.get(id)!;
      const result = update(current);
      if (result === current) return current;
      const next = readInvocation({ ...result, updatedAt: new Date().toISOString() }, current.address);
      await this.#storage.save(next);
      this.#records.set(id, next);
      this.#notify(id);
      if (current.phase !== next.phase) this.#drain();
      return next;
    });
    this.#mutations.set(id, task);
    const forget = () => { if (this.#mutations.get(id) === task) this.#mutations.delete(id); };
    void task.then(forget, forget);
    return task;
  }

  async #cancel(address: InvocationAddress): Promise<ReturnType<typeof observe>> {
    const id = this.#required(address).address.invocation;
    const record = await this.#update(id, current => {
      if (current.cancellation !== undefined || terminal(current)) return current;
      if (current.phase === "queued") return { ...current, phase: "cancelled", cancellation: "confirmed" };
      if (current.phase === "collecting" || current.phase === "received") return { ...current, cancellation: "too-late" };
      return { ...current, cancellation: "requested" };
    });
    this.#wakes.get(id)?.abort();
    if (record.phase === "cancelled" && !this.#tasks.has(id)) await this.#storage.clearWork(id);
    return observe(record);
  }

  #drain(): void {
    if (this.#stop.signal.aborted) return;
    const used = new Map<string, number>();
    const occupy = (claims: readonly string[]) => {
      for (const claim of claims) used.set(claim, (used.get(claim) ?? 0) + 1);
    };
    for (const [id, record] of this.#records) {
      if (record.phase === "submitting" || record.phase === "running"
        || (record.phase === "queued" && this.#tasks.has(id))) occupy(record.claims);
    }
    for (const [id, record] of this.#records) {
      if (terminal(record) || this.#tasks.has(id) || this.#faults.has(id)) continue;
      if (record.phase === "queued") {
        if (record.claims.some(claim => (used.get(claim) ?? 0) >= this.#capacity.get(claim)!)) continue;
        occupy(record.claims);
      }
      const task = this.#run(id).catch((error: unknown) => {
        if (!this.#stop.signal.aborted) {
          this.#faults.set(id, new Error(`Invocation ${id} paused after an execution error.`, { cause: error }));
          this.#notify(id);
        }
      }).finally(() => { this.#tasks.delete(id); this.#drain(); });
      this.#tasks.set(id, task);
    }
  }

  #context(record: InvocationRecord): ProviderContext {
    const id = record.address.invocation;
    return {
      invocation: id, request: structuredClone(record.request), signal: this.#stop.signal,
      openInput: name => openStoredResource(this.#storage.directory(id), availableResource(record.inputs, name)),
    };
  }

  async #fail(id: string, failure: InvocationFailure, receipt?: ProviderReceipt): Promise<void> {
    await this.#update(id, current => {
      const { wakeAt, progress, received, ...record } = current;
      return { ...record, phase: "failed", failure,
        ...(receipt === undefined ? {} : { receipt }),
        ...(record.cancellation === "requested" ? { cancellation: "failed" as const } : {}) };
    });
  }

  async #submitted(id: string, result: ProviderSubmission | undefined): Promise<void> {
    if (result === undefined) {
      await this.#fail(id, unknownSubmission);
    } else if (result.status === "failed") {
      await this.#fail(id, result.failure, result.receipt);
    } else {
      const receipt = readReceipt(result.receipt);
      await this.#update(id, record => result.status === "pending"
        ? { ...record, phase: "running", receipt, ...pending(result) }
        : { ...record, phase: "collecting", receipt,
          ...(record.cancellation === "requested" ? { cancellation: "too-late" as const } : {}) });
    }
  }

  async #delay(record: InvocationRecord): Promise<void> {
    const duration = (record.wakeAt ?? 0) - Date.now();
    if (duration <= 0 || (record.phase === "running" && record.cancellation === "requested")) return;
    const id = record.address.invocation;
    const wake = new AbortController();
    this.#wakes.set(id, wake);
    const signal = AbortSignal.any([wake.signal, this.#stop.signal]);
    try { await pause(duration, undefined, { signal }); }
    catch (error) { if (!signal.aborted) throw error; }
    finally { this.#wakes.delete(id); }
  }

  async #run(id: string): Promise<void> {
    const signal = this.#stop.signal;
    // Let admission record the reserved task before any asynchronous updates.
    await Promise.resolve();
    while (!signal.aborted) {
      const record = this.#records.get(id)!;
      if (terminal(record)) break;
      if (record.phase === "received") {
        const existing = await this.#storage.publication(record.address);
        if (existing === undefined) await this.#storage.publish(record.received!);
        else if (JSON.stringify(existing) !== JSON.stringify(record.received)) {
          throw new Error("Committed Publication differs from the received outputs.");
        }
        await this.#update(id, ({ received, progress, ...current }) => ({ ...current, phase: "complete" }));
        continue;
      }

      const binding = this.#bindings.find(({ endpoint }) =>
        endpoint.id === record.endpoint && endpoint.capability.id === record.capability)!;
      const { endpoint } = binding;
      if (record.phase === "queued") {
        const submitting = await this.#update(id, current => current.phase === "queued"
          ? { ...current, phase: "submitting" } : current);
        if (submitting.phase !== "submitting" || signal.aborted) continue;
        if (endpoint.kind === "direct") {
          await this.#direct(submitting, endpoint, false);
          continue;
        }
        let result: ProviderSubmission | undefined;
        try { result = await endpoint.submit(this.#context(submitting)); }
        catch {
          if (signal.aborted) return;
          // Re-enter through reconciliation. A thrown submission may have reached the service.
          continue;
        }
        await this.#submitted(id, result);
        continue;
      }
      if (record.phase === "submitting") {
        if (endpoint.kind === "direct") {
          await this.#delay(record);
          if (!signal.aborted) await this.#direct(record, endpoint, true);
        } else await this.#submitted(id, await endpoint.reconcile?.(this.#context(record)));
        continue;
      }

      if (endpoint.kind !== "job") throw new Error(`Invocation ${id} needs an asynchronous Endpoint.`);
      if (record.phase === "running" && record.cancellation === "requested") {
        const context = { ...this.#context(record), receipt: structuredClone(record.receipt!) };
        const outcome = await endpoint.cancel?.(context) ?? "unsupported";
        await this.#update(id, current => {
          if (outcome === "confirmed") {
            const { wakeAt, progress, ...next } = current;
            return { ...next, phase: "cancelled", cancellation: outcome };
          }
          return { ...current, cancellation: outcome };
        });
        continue;
      }
      await this.#delay(record);
      if (signal.aborted || this.#records.get(id)?.cancellation !== record.cancellation) continue;

      if (record.phase === "running") {
        const result = await endpoint.poll({ ...this.#context(record), receipt: structuredClone(record.receipt!) });
        if (result.status === "failed") await this.#fail(id, result.failure, result.receipt);
        else await this.#update(id, current => {
          if (result.status === "pending") return { ...current, ...pending(result) };
          const { wakeAt, progress, ...next } = current;
          if (result.status === "cancelled") return { ...next, phase: "cancelled", cancellation: "confirmed" };
          return { ...next, phase: "collecting",
            ...(current.cancellation === "requested" ? { cancellation: "too-late" as const } : {}) };
        });
      } else await this.#receive(record, endpoint, writer =>
        endpoint.collect({ ...this.#context(record), receipt: structuredClone(record.receipt!), ...writer }));
    }
    if (terminal(this.#records.get(id)!)) await this.#storage.clearWork(id);
  }

  async #direct(record: InvocationRecord, endpoint: ProviderDirectEndpoint, recovering: boolean): Promise<void> {
    const id = record.address.invocation;
    if (recovering && (record.receipt === undefined || endpoint.recover === undefined)) {
      await this.#fail(id, unknownSubmission);
      return;
    }
    await this.#receive(record, endpoint, async writer => {
      const context = { ...this.#context(record), ...writer };
      if (recovering) return await endpoint.recover!({ ...context, receipt: structuredClone(record.receipt!) });
      try {
        return await endpoint.run({
          ...context,
          checkpointReceipt: async receipt => {
            await this.#update(id, current => ({ ...current, receipt: readReceipt(receipt) }));
          },
        });
      } catch (error) {
        if (context.signal.aborted) throw error;
        if (endpoint.recover !== undefined && this.#records.get(id)?.receipt !== undefined) {
          return { status: "pending", retryAfterMs: 1_000 };
        }
        return { status: "failed", failure: unknownSubmission };
      }
    });
  }

  async #receive(
    record: InvocationRecord, endpoint: ProviderEndpoint,
    receive: (writer: ProviderOutputWriter) => Promise<ProviderCollection>,
  ): Promise<void> {
    const id = record.address.invocation;
    const stage = join(this.#storage.directory(id), ".collecting");
    await rm(stage, { recursive: true, force: true });
    await mkdir(join(stage, "files"), { recursive: true, mode: 0o700 });
    const definitions = endpoint.capability.outputs;
    const resources = new Map<string, Map<string, Promise<PublicationResource>>>();
    let nextFile = 0;
    let result;
    try {
      result = await receive({
        writeResource: (output, name, source) => {
          if (!Object.hasOwn(definitions, output)) throw new Error(`Unknown output ${output}.`);
          identity(name, "Output resource name");
          text(source.mediaType, "Output resource media type");
          if (source.size !== undefined) integer(source.size, "Output resource size", 0);
          const files = resources.get(output) ?? new Map();
          if (files.has(name)) throw new Error(`Repeated resource ${name} for output ${output}.`);
          const work = stageResource(stage, `files/${nextFile++}.bin`, source, this.#stop.signal);
          // Collection may initiate several writes before awaiting their results.
          void work.catch(() => undefined);
          files.set(name, work);
          resources.set(output, files);
          return work;
        },
      });
    } finally {
      await Promise.allSettled([...resources.values()].flatMap(files => [...files.values()]));
    }
    if (result.status === "failed") { await this.#fail(id, result.failure, result.receipt); return; }
    if (result.status === "pending") { await this.#update(id, current => ({ ...current, ...pending(result) })); return; }
    if (Object.keys(result.values).length !== Object.keys(definitions).length) {
      throw new Error("Provider outputs differ from the Capability declaration.");
    }
    const outputs = await Promise.all(Object.entries(definitions).map(async ([name, output]) => {
      if (!Object.hasOwn(result.values, name)) throw new Error(`Provider did not return output ${name}.`);
      const files = Object.fromEntries(await Promise.all([...(resources.get(name) ?? [])].map(async ([key, value]) => [key, await value])));
      return [name, { type: output.type, value: output.read(result.values[name], structuredClone(files)), resources: files }];
    }));
    const publication: Publication = readPublication({
      format: "hypit.publication", address: record.address, capability: record.capability,
      publishedAt: new Date().toISOString(), outputs: Object.fromEntries(outputs),
    }, record.address);
    await this.#update(id, ({ wakeAt, progress, ...current }) => ({ ...current, phase: "received", received: publication,
      ...(current.cancellation === "requested" ? { cancellation: "too-late" as const } : {}) }));
  }
}

export async function openLocalExecutionEnvironment(options: LocalExecutionEnvironmentOptions): Promise<ExecutionEnvironment> {
  const id = identity(options.id, "Execution Environment id");
  text(options.title, "Execution Environment title");
  const root = resolve(text(options.dataRoot, "Execution Environment data root"));
  const capacity = new Map(Object.entries(options.capacities ?? {}).map(([name, limit]) =>
    [identity(name, "Capacity name"), integer(limit, `Capacity ${name}`, 1)]));
  const keys = new Set<string>();
  const bindings = options.endpoints.map(({ endpoint, claims = [] }) => {
    identity(endpoint.id, "Endpoint id");
    text(endpoint.capability.id, "Capability id");
    text(endpoint.capability.title, "Capability title");
    const outputs = Object.entries(endpoint.capability.outputs);
    if (outputs.length === 0) throw new Error(`Capability ${endpoint.capability.id} needs a declared output.`);
    for (const [name, output] of outputs) {
      identity(name, "Output name");
      text(output.type, "Output type");
    }
    const key = JSON.stringify([endpoint.id, endpoint.capability.id]);
    if (keys.has(key)) throw new Error(`Repeated binding for ${endpoint.id} and ${endpoint.capability.id}.`);
    keys.add(key);
    if (new Set(claims).size !== claims.length || claims.some(claim => !capacity.has(claim))) {
      throw new Error(`Endpoint ${endpoint.id} has invalid capacity claims.`);
    }
    return { endpoint, claims: [...claims] };
  });
  const unlock = await lockEnvironment(root);
  try {
    const storage = new InvocationStorage(root, id);
    const records = await storage.open();
    for (const record of records) {
      if (terminal(record) || record.phase === "received") continue;
      const binding = bindings.find(({ endpoint }) => endpoint.id === record.endpoint && endpoint.capability.id === record.capability);
      if (binding === undefined || binding.claims.length !== record.claims.length
        || record.claims.some(claim => !binding.claims.includes(claim))) {
        throw new Error(`Invocation ${record.address.invocation} requires Endpoint ${record.endpoint} for ${record.capability} with its recorded capacity claims.`);
      }
    }
    records.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
    return new LocalExecutionEnvironment(options, bindings, capacity, storage, unlock, records);
  } catch (error) { unlock(); throw error; }
}

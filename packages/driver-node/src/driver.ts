import { randomUUID } from "node:crypto";

import { reduce, resolveNeedCommand, resolveProducer } from "@hypit/core";
import type { ProducerHandlerResult } from "@hypit/component-kit";
import type { EndpointCredential, EndpointFulfillment, EndpointOutcome } from "@hypit/endpoint-kit";
import { endpointResourceClaims } from "@hypit/endpoint-kit";
import type {
  BuildState,
  CommandResult,
  CoreCommand,
  FulfillNeedCommand,
  InvokeProducerCommand,
  TypedRecord,
} from "@hypit/protocol";
import {
  TypeValidatorRegistry,
  validateValue,
} from "@hypit/validation";
import type { TypeValidatorRegistryLike } from "@hypit/validation";
import type {
  ResourceStore,
  CredentialStore,
  CredentialValue,
  OperationSnapshot,
  OperationStore,
  RuntimeExecutionContext,
  RuntimeExecutionResult,
  RuntimePreparation,
  RuntimeRunnableCommand,
} from "@hypit/runtime";
import { writableCredentialStore } from "@hypit/runtime";

import { MemoryResourceStore } from "./resources.js";
import {
  ProducerRegistry,
  EndpointRegistry,
  producerRegistryKey,
  endpointCapabilityKey,
  endpointReturnKey,
} from "./registry.js";
import type {
  BlockedCommand,
  DriverExecutionOutcome,
  DriverRunResult,
  EndpointRegistration,
} from "./types.js";

export type NodeDriverOptions = {
  readonly producers?: ProducerRegistry;
  readonly endpoints?: EndpointRegistry;
  readonly resources?: ResourceStore;
  /** Runtime execution may isolate transient bytes by Build without exposing that policy to Endpoints. */
  readonly resourcesForBuild?: (build: string) => ResourceStore;
  readonly operations?: OperationStore;
  readonly credentials?: CredentialStore;
  readonly validators?: TypeValidatorRegistryLike;
  readonly actions?: import("@hypit/runtime").RuntimeActionExecutor;
};

type Executable =
  | {
      readonly command: InvokeProducerCommand;
      readonly resources: readonly import("@hypit/runtime").RuntimeResourceClaim[];
      readonly run: () => Promise<ProducerHandlerResult>;
    }
  | {
      readonly command: FulfillNeedCommand;
      readonly endpointId: string;
      readonly resources: readonly import("@hypit/runtime").RuntimeResourceClaim[];
      readonly registration: EndpointRegistration;
    };

function failureMessage(error: unknown): string {
  const parts: string[] = [];
  let cursor: unknown = error;
  const seen = new Set<unknown>();
  while (cursor !== undefined && cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    if (cursor instanceof Error) {
      const code = "code" in cursor && typeof cursor.code === "string" ? ` [${cursor.code}]` : "";
      parts.push(`${cursor.message}${code}`);
      cursor = cursor.cause;
      continue;
    }
    parts.push(String(cursor));
    break;
  }
  return [...new Set(parts)].join("; caused by: ");
}

export class NodeDriver {
  readonly producers: ProducerRegistry;
  readonly endpoints: EndpointRegistry;
  readonly resources: ResourceStore;
  readonly #resourcesForBuild: ((build: string) => ResourceStore) | undefined;
  readonly operations: OperationStore | undefined;
  readonly credentials: CredentialStore | undefined;
  readonly validators: TypeValidatorRegistryLike;
  readonly #actions: import("@hypit/runtime").RuntimeActionExecutor | undefined;
  readonly #credentialReads = new Map<string, Promise<CredentialValue | undefined>>();

  constructor(options: NodeDriverOptions = {}) {
    this.producers = options.producers ?? new ProducerRegistry();
    this.endpoints = options.endpoints ?? new EndpointRegistry();
    this.resources = options.resources ?? new MemoryResourceStore();
    this.#resourcesForBuild = options.resourcesForBuild;
    this.operations = options.operations;
    this.credentials = options.credentials;
    this.validators = options.validators ?? new TypeValidatorRegistry();
    this.#actions = options.actions;
  }

  #resourceStore(build?: string): ResourceStore {
    return build === undefined ? this.resources : this.#resourcesForBuild?.(build) ?? this.resources;
  }

  async #endpointCredentials(
    registration: EndpointRegistration,
  ): Promise<Readonly<Record<string, EndpointCredential>>> {
    const requested = registration.credentials ?? {};
    if (Object.keys(requested).length === 0) return {};
    if (this.credentials === undefined) {
      throw new Error(`Endpoint ${registration.id} requires a CredentialStore`);
    }
    const resolved: Record<string, EndpointCredential> = {};
    for (const slot of Object.keys(requested).sort()) {
      const ref = requested[slot]!;
      const key = JSON.stringify([ref.store, ref.key]);
      let read = this.#credentialReads.get(key);
      if (read === undefined) {
        read = this.credentials.resolve(ref).finally(() => this.#credentialReads.delete(key));
        this.#credentialReads.set(key, read);
      }
      const value = await read;
      if (value === undefined) {
        throw new Error(`Endpoint ${registration.id} credential ${slot} is unavailable from ${ref.store}:${ref.key}`);
      }
      const writable = await writableCredentialStore(this.credentials, ref);
      resolved[slot] = {
        ...value,
        ...(writable === undefined ? {} : {
          replace: async (replacement: CredentialValue) => await writable.put(ref, replacement),
        }),
      };
    }
    return resolved;
  }

  #producerInputs(state: BuildState, command: InvokeProducerCommand): Record<string, TypedRecord> {
    const inputs: Record<string, TypedRecord> = {};
    const records = new Map(state.records.map((item) => [item.id, item]));
    for (const [port, id] of Object.entries(command.inputs)) {
      const record = records.get(id);
      if (record === undefined) throw new Error(`${command.id} input ${id} is missing`);
      Object.defineProperty(inputs, port, {
        value: structuredClone(record),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return inputs;
  }

  #classify(
    state: BuildState,
    command: CoreCommand,
  ): { readonly executable?: Executable; readonly blocked?: BlockedCommand } {
    if (command.kind === "invoke-producer") {
      const registration = this.producers.producer(command.producer);
      if (registration === undefined) {
        return {
          blocked: {
            command: command.id,
            reason: "missing-producer",
            subject: producerRegistryKey(command.producer),
          },
        };
      }
      return {
        executable: {
          command,
          resources: registration.scheduling?.resources ?? [],
          run: async () =>
            registration.handler({
              command: structuredClone(command),
              producer: structuredClone(command.producer),
              inputs: this.#producerInputs(state, command),
            }),
        },
      };
    }

    const resolution = this.endpoints.resolve(command.need);
    if (resolution.status === "missing") {
      return {
        blocked: {
          command: command.id,
          reason: "missing-endpoint",
          subject: resolution.endpointId === undefined
            ? `${endpointCapabilityKey(command.need.capability)} -> ${endpointReturnKey(command.need.returns)}`
            : `${endpointCapabilityKey(command.need.capability)} -> ${resolution.endpointId}`,
        },
      };
    }
    if (resolution.status === "unsupported") {
      return {
        blocked: {
          command: command.id,
          reason: "unsupported-endpoint-request",
          subject: resolution.rejections
            .map((rejection) => `${rejection.endpointId}: ${rejection.reason}`)
            .join("; "),
        },
      };
    }
    if (resolution.status === "ambiguous") {
      return {
        blocked: {
          command: command.id,
          reason: "ambiguous-endpoint",
          subject: `${endpointCapabilityKey(command.need.capability)} -> ${resolution.endpointIds.join(", ")}`,
        },
      };
    }
    const registration = resolution.registration;
    if (registration.kind === "asynchronous" && this.operations === undefined) {
      return {
        blocked: {
          command: command.id,
          reason: "missing-operation-store",
          subject: registration.id,
        },
      };
    }
    return {
      executable: {
        command,
        endpointId: registration.id,
        resources: registration.scheduling === undefined ? [{
          id: `endpoint:${registration.id}`,
          limit: 1,
        }] : endpointResourceClaims(registration.scheduling, command.need),
        registration,
      },
    };
  }

  async #endpointEvent(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    result: EndpointFulfillment,
  ): Promise<CommandResult> {
    await validateValue(
      state.program.closure,
      executable.command.need.returns,
      result.value,
      this.validators,
    );
    return {
      kind: "need-fulfilled",
      command: executable.command.id,
      value: result.value,
    } as const;
  }

  async acceptOperation(
    state: BuildState,
    snapshot: OperationSnapshot,
  ): Promise<CommandResult | undefined> {
    if ((snapshot.status === "completed" || snapshot.status === "pending") && snapshot.completion !== undefined) {
      const command = state.outstanding.find((item) => item.id === snapshot.command);
      if (command?.kind !== "fulfill-need") return undefined;
      await validateValue(state.program.closure, command.need.returns, snapshot.completion.value, this.validators);
      if (snapshot.status === "pending") {
        await this.operations!.update(snapshot.id, { status: "completed", completion: snapshot.completion });
      }
      return { kind: "need-fulfilled", command: snapshot.command, value: snapshot.completion.value };
    }
    if (snapshot.status === "failed") {
      const failure = snapshot.failure;
      if (failure === undefined) throw new Error(`Operation ${snapshot.id} has no failure`);
      const content = {
        kind: "command-failed",
        command: snapshot.command,
        code: failure.code,
        message: failure.message,
      } as const;
      return content;
    }
    if (snapshot.status === "cancelled") {
      const content = {
        kind: "command-failed",
        command: snapshot.command,
        code: "CANCELLED",
        message: `Operation ${snapshot.id} was cancelled by the Runtime capacity controller`,
      } as const;
      return content;
    }
    return undefined;
  }

  async #executeEndpoint(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    if (executable.registration.kind !== "asynchronous") throw new Error("Endpoint is not asynchronous");
    const operations = this.operations;
    if (operations === undefined) throw new Error("asynchronous Endpoint requires OperationStore");
    const history = await operations.list({ build: context.build, command: executable.command.id });
    if (history.length > 1) throw new Error(`Command ${executable.command.id} has multiple Operations`);
    let operation = history[0];
    if (operation !== undefined && operation.endpoint !== executable.endpointId) {
      throw new Error(`Operation ${operation.id} belongs to ${operation.endpoint}; its execution source cannot change`);
    }
    operation ??= await operations.create({
      id: `op_${randomUUID()}`, build: context.build, command: executable.command.id,
      endpoint: executable.endpointId, status: "pending", submission: "queued", createdAt: Date.now(),
      request: structuredClone(executable.command),
      credentials: structuredClone(executable.registration.credentials ?? {}),
      ...(executable.registration.pool === undefined ? {} : { pool: executable.registration.pool }),
      wakeAt: Date.now(), progress: { phase: "ready-to-submit" },
    });
    if (operation.status === "pending" && operation.completion === undefined) {
      operation = await this.#advanceOperation(operation, executable.registration, context);
    }
    if (operation.remoteEnded) await context.releaseOperationCapacity?.();
    const event = await this.acceptOperation(state, operation);
    return event === undefined ? {
      status: "pending", operation: operation.id,
      ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
    } : { status: "completed", event };
  }

  async #advanceOperation(
    operation: OperationSnapshot,
    registration: EndpointRegistration,
    runtimeContext: RuntimeExecutionContext,
  ): Promise<OperationSnapshot> {
    const operations = this.operations!;
    if (registration.kind !== "asynchronous") throw new Error("Operation Endpoint is not asynchronous");
    if (operation.status !== "pending" || operation.completion !== undefined) return operation;
    if ((operation.wakeAt ?? 0) > Date.now()) return operation;
    const command = operation.request;
    if (command === undefined) throw new Error(`Operation ${operation.id} has no stored request`);
    const endpoint = registration.endpoint;
    const action: import("@hypit/endpoint-kit").EndpointAction = operation.remoteEnded ? "collect"
      : operation.handle !== undefined ? "poll" : "submit";
    if (action === "submit" && operation.submission !== "queued") {
      return await operations.update(operation.id, {
        status: "failed", failure: { code: "SUBMISSION_INTERRUPTED",
          message: "Submission ended without a task receipt; this execution attempt has failed" },
      });
    }
    const invoke = async (): Promise<EndpointOutcome> => {
      const context = {
        command: structuredClone(command), need: structuredClone(command.need),
        resources: this.#resourceStore(operation.build), operation: operation.id,
        credentials: await this.#endpointCredentials({ ...registration, credentials: operation.credentials ?? registration.credentials ?? {} }),
        checkpoint: async (checkpoint: import("@hypit/endpoint-kit").EndpointCheckpoint) => {
          await operations.update(operation.id, { status: "pending", ...checkpoint,
            submission: "accepted", acknowledgedAt: operation.acknowledgedAt ?? Date.now(), wakeAt: Date.now(), progress: { phase: checkpoint.remoteEnded ? "collecting" : "submitted" } });
          if (checkpoint.remoteEnded) await runtimeContext.releaseOperationCapacity?.();
        },
      };
      if (action === "submit") {
        await operations.update(operation.id, { status: "pending", submission: "started", progress: { phase: "submitting" } });
        return await endpoint.start(context);
      }
      const pollContext = { ...context, handle: structuredClone(operation.handle!) };
      if (action === "collect") {
        if (endpoint.collect === undefined) throw new Error(`Endpoint ${registration.id} declared artifacts ready but has no collect action`);
        return await endpoint.collect(pollContext);
      }
      return await endpoint.poll(pollContext);
    };
    let outcome: EndpointOutcome;
    try {
      const resources = registration.scheduling?.actions?.[action] ?? [];
      if (resources.length > 0) {
        if (this.#actions === undefined) throw new Error(`Endpoint ${registration.id} requires Runtime action admission`);
        const result = await this.#actions.run({ build: operation.build, command: operation.command, action, resources }, invoke);
        if (result.status === "deferred") return await operations.update(operation.id, {
          status: "pending", ...(result.wakeAt === undefined ? {} : { wakeAt: result.wakeAt }),
          progress: { phase: "waiting-resource" },
        });
        outcome = result.value;
      } else outcome = await invoke();
    } catch (error) {
      return await operations.update(operation.id, {
        status: "failed", failure: { code: "ENDPOINT_ACTION_FAILED",
          message: `${action} failed: ${failureMessage(error)}` },
      });
    }
    const recorded = await operations.read(operation.id) ?? operation;
    const receipt = outcome.receipt ?? recorded.receipt;
    const facts = receipt === undefined ? {} : {
      receipt, acknowledgedAt: recorded.acknowledgedAt ?? Date.now(),
    };
    if (outcome.status === "pending") {
      return await operations.update(operation.id, {
        status: "pending", ...facts, submission: "accepted", handle: outcome.handle,
        wakeAt: outcome.wakeAt ?? Date.now(),
        ...(outcome.progress === undefined ? {} : { progress: outcome.progress }),
      });
    }
    if (outcome.status === "ready") return await operations.update(operation.id, {
      status: "pending", ...facts, remoteEnded: true, endedAt: Date.now(), handle: outcome.handle,
      wakeAt: Date.now(), progress: { phase: "ready-to-collect" },
    });
    if (outcome.status === "failed") return await operations.update(operation.id, {
      status: "failed", ...facts, failure: outcome.failure,
    });
    return await operations.update(operation.id, {
      status: "pending", ...facts, remoteEnded: true, endedAt: recorded.endedAt ?? Date.now(),
      completion: outcome.result, wakeAt: Date.now(), progress: { phase: "ready-to-accept" },
    });
  }

  async advanceOperation(operation: OperationSnapshot): Promise<OperationSnapshot> {
    if (operation.request === undefined) throw new Error(`Operation ${operation.id} has no stored request`);
    const selected = this.endpoints.resolve(operation.request.need);
    if (selected.status !== "resolved" || selected.registration.id !== operation.endpoint) {
      throw new Error(`Operation ${operation.id} cannot change its selected Endpoint ${operation.endpoint}`);
    }
    return await this.#advanceOperation(operation, selected.registration, { build: operation.build });
  }

  async #execute(
    state: BuildState,
    executable: Executable,
    context?: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    if (!("endpointId" in executable)) {
      try {
        const result = (await executable.run()) as ProducerHandlerResult;
        const producer = resolveProducer(state.program.closure, executable.command.producer);
        for (const port of producer.outputs) {
          const value = result.outputs[port.name];
          if (value === undefined) continue;
          await validateValue(state.program.closure, port.type, value, this.validators);
        }
        const content = {
          kind: "producer-completed",
          command: executable.command.id,
          outputs: result.outputs,
          needs: result.needs,
        } as const;
        return {
          status: "completed",
          event: content,
        };
      } catch (error) {
        const producer = executable.command.producer;
        throw new Error(
          `Producer ${producer.module.name}@${producer.module.version}#${producer.name} failed: ${failureMessage(error)}`,
          { cause: error },
        );
      }
    }
    if (executable.registration.kind === "asynchronous") {
      if (context === undefined) throw new Error("asynchronous Endpoint execution requires a stable Build id");
      try {
        return await this.#executeEndpoint(state, executable, context);
      } catch (error) {
        throw new Error(
          `Endpoint ${executable.endpointId} failed ${executable.command.need.capability.name}: ${failureMessage(error)}`,
          { cause: error },
        );
      }
    }
    try {
      const result = await executable.registration.handler({
        command: structuredClone(executable.command),
        need: structuredClone(executable.command.need),
        resources: this.#resourceStore(context?.build),
        credentials: await this.#endpointCredentials(executable.registration),
      });
      return { status: "completed", event: await this.#endpointEvent(state, executable, result) };
    } catch (error) {
      throw new Error(
        `Endpoint ${executable.endpointId} failed ${executable.command.need.capability.name}: ${failureMessage(error)}`,
        { cause: error },
      );
    }
  }

  /** Regenerate Core commands, then classify only what this Host can execute. */
  prepare(initial: BuildState): RuntimePreparation {
    const state = reduce(initial);
    if (state.status === "complete" || state.status === "failed") {
      return { state, runnable: [], blocked: [] };
    }
    const classifications = state.outstanding.map((command) => ({
      command,
      ...this.#classify(state, command),
    }));
    return {
      state,
      runnable: classifications.flatMap(({ executable }) => executable === undefined ? [] : [{
        command: executable.command,
        resources: executable.resources,
        capacityMode: "endpointId" in executable && executable.registration.kind === "asynchronous"
          ? "asynchronous"
          : "active",
      }]),
      blocked: classifications
        .map((item) => item.blocked)
        .filter((item): item is BlockedCommand => item !== undefined),
    };
  }

  /** Execute one command emitted by `prepare` in the same scheduling turn. */
  async executeCommand(
    state: BuildState,
    descriptor: RuntimeRunnableCommand,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    const classified = this.#classify(state, descriptor.command);
    if (classified.executable === undefined) {
      throw new Error(`command ${descriptor.command.id} is no longer executable`);
    }
    return await this.#execute(state, classified.executable, context);
  }

  /** Stop observing this Operation and make at most one explicit cancellation request. */
  async cancelOperation(initial: BuildState, operation: OperationSnapshot): Promise<OperationSnapshot> {
    const operations = this.operations;
    if (operations === undefined) throw new Error("cancelling an Operation requires OperationStore");
    const current = await operations.read(operation.id) ?? operation;
    if (current.status !== "pending") return current;
    let cancellation: NonNullable<OperationSnapshot["cancellation"]> = { outcome: "unsupported" };
    if (current.handle !== undefined && !current.remoteEnded) {
      try {
        const command = current.request ?? resolveNeedCommand(initial, current.command);
        if (command === undefined) throw new Error(`Operation ${current.id} has no Need Command`);
        const selected = this.endpoints.resolve(command.need);
        if (selected.status !== "resolved" || selected.registration.id !== current.endpoint
          || selected.registration.kind !== "asynchronous") throw new Error("Operation Endpoint changed");
        const result = await selected.registration.endpoint.cancel?.({
          command, need: command.need, operation: current.id, handle: current.handle,
          resources: this.#resourceStore(current.build),
          credentials: await this.#endpointCredentials(selected.registration),
        });
        cancellation = { outcome: result?.status ?? "unsupported" };
      } catch (error) {
        cancellation = { outcome: "failed", message: failureMessage(error) };
      }
    }
    return await operations.update(current.id, { status: "cancelled", cancellation });
  }

  async run(initial: BuildState, context?: RuntimeExecutionContext): Promise<DriverRunResult> {
    let state = initial;
    const outcomes: DriverExecutionOutcome[] = [];

    while (true) {
      state = reduce(state);
      if (state.status === "complete") {
        return { status: "complete", state, outcomes, blocked: [] };
      }
      if (state.status === "failed") {
        return { status: "failed", state, outcomes, blocked: [] };
      }

      const classifications = state.outstanding.map((command) => ({
        command,
        ...this.#classify(state, command),
      }));
      const selected = classifications.find((item) => item.executable !== undefined)?.executable;
      if (selected === undefined) {
        const blocked = classifications
          .map((item) => item.blocked)
          .filter((item): item is BlockedCommand => item !== undefined);
        return { status: "paused", state, outcomes, blocked };
      }

      try {
        const execution = await this.#execute(state, selected, context);
        if (execution.status === "pending") {
          outcomes.push({
            command: selected.command.id,
            kind: selected.command.kind,
            status: "pending",
            operation: execution.operation,
            ...(execution.wakeAt === undefined ? {} : { wakeAt: execution.wakeAt }),
          });
          return { status: "paused", state, outcomes, blocked: [] };
        }
        if (execution.status === "deferred") {
          throw new Error("direct NodeDriver execution has no Runtime capacity admission to defer");
        }
        const event = execution.event;
        state = reduce(state, event);
        outcomes.push({
          command: selected.command.id,
          kind: selected.command.kind,
          status: "completed",
        });
      } catch (error) {
        outcomes.push({
          command: selected.command.id,
          kind: selected.command.kind,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        state = reduce(state, {
          kind: "command-failed", command: selected.command.id, code: "EXECUTION_FAILED",
          message: failureMessage(error),
        });
        return { status: "failed", state, outcomes, blocked: [] };
      }
    }
  }
}

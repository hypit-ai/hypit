import { randomUUID } from "node:crypto";

import { reduce, resolveNeedCommand, resolveProducer } from "@hypit/core";
import type { ProducerHandlerResult } from "@hypit/component-kit";
import type { EndpointFulfillment, EndpointOutcome } from "@hypit/endpoint-kit";
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
  OperationUpdate,
  RuntimeExecutionContext,
  RuntimeExecutionResult,
  RuntimePreparation,
  RuntimeRunnableCommand,
} from "@hypit/runtime";

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

  constructor(options: NodeDriverOptions = {}) {
    this.producers = options.producers ?? new ProducerRegistry();
    this.endpoints = options.endpoints ?? new EndpointRegistry();
    this.resources = options.resources ?? new MemoryResourceStore();
    this.#resourcesForBuild = options.resourcesForBuild;
    this.operations = options.operations;
    this.credentials = options.credentials;
    this.validators = options.validators ?? new TypeValidatorRegistry();
  }

  #resourceStore(build?: string): ResourceStore {
    return build === undefined ? this.resources : this.#resourcesForBuild?.(build) ?? this.resources;
  }

  async #endpointCredentials(
    registration: EndpointRegistration,
  ): Promise<Readonly<Record<string, CredentialValue>>> {
    const requested = registration.credentials ?? {};
    if (Object.keys(requested).length === 0) return {};
    if (this.credentials === undefined) {
      throw new Error(`Endpoint ${registration.id} requires a CredentialStore`);
    }
    const resolved: Record<string, CredentialValue> = {};
    for (const slot of Object.keys(requested).sort()) {
      const ref = requested[slot]!;
      const value = await this.credentials.resolve(ref);
      if (value === undefined) {
        throw new Error(`Endpoint ${registration.id} credential ${slot} is unavailable from ${ref.store}:${ref.key}`);
      }
      resolved[slot] = value;
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

  async #completedOperation(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    snapshot: OperationSnapshot,
    expectedOperation: string,
  ): Promise<RuntimeExecutionResult> {
    if (snapshot.id !== expectedOperation) {
      throw new Error(`OperationStore returned ${snapshot.id} for ${expectedOperation}`);
    }
    if (snapshot.status === "completed" && snapshot.completion !== undefined) {
      return {
        status: "completed",
        event: await this.#endpointEvent(state, executable, snapshot.completion),
      };
    }
    if (snapshot.status === "failed") {
      const failure = snapshot.failure;
      if (failure === undefined) throw new Error(`Operation ${snapshot.id} has no failure`);
      const content = {
        kind: "command-failed",
        command: executable.command.id,
        code: failure.code,
        message: failure.message,
      } as const;
      return {
        status: "completed",
        event: content,
      };
    }
    if (snapshot.status === "cancelled") {
      const content = {
        kind: "command-failed",
        command: executable.command.id,
        code: "CANCELLED",
        message: `Operation ${snapshot.id} was cancelled by the Runtime capacity controller`,
      } as const;
      return {
        status: "completed",
        event: content,
      };
    }
    return {
      status: "pending",
      operation: snapshot.id,
      ...(snapshot.wakeAt === undefined ? {} : { wakeAt: snapshot.wakeAt }),
    };
  }

  async #executeEndpoint(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    if (executable.registration.kind !== "asynchronous") throw new Error("Endpoint is not asynchronous");
    const operations = this.operations;
    if (operations === undefined) throw new Error("asynchronous Endpoint requires OperationStore");
    const base = {
      build: context.build,
      command: executable.command.id,
      endpoint: executable.endpointId,
    } as const;
    const history = await operations.list({
      build: base.build,
      command: base.command,
      endpoint: base.endpoint,
    });
    if (history.length > 1) {
      throw new Error(`Command ${base.command} has multiple asynchronous Operations; refusing to submit or choose between them`);
    }
    const latest = history[0];
    if (latest?.status === "completed" || latest?.status === "cancelled") {
      return await this.#completedOperation(state, executable, latest, latest.id);
    }
    if (latest?.status === "pending" && latest.cancellationRequested) {
      const settled = await this.cancelOperation(state, latest);
      return await this.#completedOperation(state, executable, settled, latest.id);
    }
    if (latest?.status === "pending" && latest.wakeAt !== undefined && latest.wakeAt > Date.now()) {
      return { status: "pending", operation: latest.id, wakeAt: latest.wakeAt };
    }
    if (latest?.status === "failed") {
      return await this.#completedOperation(state, executable, latest, latest.id);
    }
    if (latest?.status === "pending" && latest.handle === undefined) {
      const unknown = await operations.update(latest.id, {
        status: "pending",
        wakeAt: Date.now() + 30_000,
        progress: { phase: "submission-unknown" },
        failure: {
          code: "SUBMISSION_UNKNOWN",
          message: `Operation ${latest.id} stopped before its Endpoint acknowledgement was stored; the same Build will not submit it again`,
        },
      });
      return await this.#completedOperation(state, executable, unknown, latest.id);
    }
    const fresh = latest === undefined;
    const identity = fresh
      ? { id: `op_${randomUUID()}`, ...base }
      : latest;
    const endpointContext = {
      command: structuredClone(executable.command),
      need: structuredClone(executable.command.need),
      resources: this.#resourceStore(context.build),
      credentials: await this.#endpointCredentials(executable.registration),
      operation: identity.id,
    };
    let outcome: EndpointOutcome;
    if (latest === undefined) {
      await operations.create({
        ...identity,
        status: "pending",
        progress: { phase: "submitting" },
      });
      try {
        outcome = await executable.registration.endpoint.start(endpointContext);
      } catch (error) {
        const unknown = await operations.update(identity.id, {
          status: "pending",
          wakeAt: Date.now() + 30_000,
          progress: { phase: "submission-unknown" },
          failure: {
            code: "SUBMISSION_UNKNOWN",
            message: `Endpoint start ended without a stored acknowledgement: ${failureMessage(error)}`,
          },
        });
        return await this.#completedOperation(state, executable, unknown, identity.id);
      }
    } else {
      if (latest.status !== "pending" || latest.handle === undefined) {
        throw new Error(`Operation ${latest.id} cannot be polled`);
      }
      try {
        outcome = await executable.registration.endpoint.poll({
          ...endpointContext,
          handle: structuredClone(latest.handle),
          ...(latest.failure === undefined ? {} : { settling: true as const }),
        });
      } catch {
        // A transport error says nothing about whether the submitted work has ended.
        outcome = { status: "pending", handle: latest.handle, wakeAt: Date.now() + 1_000,
          progress: { phase: "poll-unavailable" } };
      }
    }
    const write = async (update: OperationUpdate): Promise<OperationSnapshot> =>
      await operations.update(identity.id, update);
    if (outcome.status === "pending") {
      const handle = outcome.handle === undefined ? latest?.handle : outcome.handle;
      const failure = latest?.failure ?? outcome.failure;
      const written = await write({
        status: "pending",
        ...(handle === undefined ? {} : { handle }),
        ...(outcome.wakeAt === undefined ? {} : { wakeAt: outcome.wakeAt }),
        ...(outcome.progress === undefined ? {} : { progress: outcome.progress }),
        ...(failure === undefined ? {} : { failure }),
      });
      return await this.#completedOperation(
        state,
        executable,
        written,
        identity.id,
      );
    }
    if (latest?.failure !== undefined || outcome.status === "settled") {
      const written = await write({ status: "failed", failure: latest?.failure ?? {
        code: "ENDPOINT_SETTLED_WITHOUT_RESULT", message: "Endpoint ended without a fulfillment result",
      } });
      return await this.#completedOperation(state, executable, written, identity.id);
    }
    if (outcome.status === "failed") {
      const written = await write({
        status: "failed",
        failure: outcome.failure,
      });
      return await this.#completedOperation(
        state,
        executable,
        written,
        identity.id,
      );
    }
    // Validate before the terminal completion becomes durable. Result writing may later
    // accept this stored value without loading or calling the Endpoint package again.
    const event = await this.#endpointEvent(state, executable, outcome.result);
    await write({
      status: "completed",
      completion: outcome.result,
    });
    return { status: "completed", event };
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

  /** Cancel once, then observe the same remote work until termination is confirmed. */
  async cancelOperation(initial: BuildState, operation: OperationSnapshot): Promise<OperationSnapshot> {
    const operations = this.operations;
    if (operations === undefined) throw new Error("cancelling an Operation requires OperationStore");
    const current = await operations.read(operation.id) ?? operation;
    if (current.status !== "pending") return current;
    if (current.cancellationRequested && (current.wakeAt ?? 0) > Date.now()) return current;
    const pending = (phase: string, wakeAt = Date.now() + 1_000, handle = current.handle) => operations.update(current.id, {
      status: "pending", ...(handle === undefined ? {} : { handle }),
      wakeAt, progress: { phase }, cancellationRequested: true,
      ...(current.failure === undefined ? {} : { failure: current.failure }),
    });
    if (current.handle === undefined) return await pending("submission-unknown", Date.now() + 30_000);
    const command = resolveNeedCommand(initial, current.command);
    if (command === undefined) throw new Error(`Operation ${current.id} has no matching Need Command`);
    const { need } = command;
    const resolution = this.endpoints.resolve(need);
    if (resolution.status !== "resolved" || resolution.registration.id !== current.endpoint
      || resolution.registration.kind !== "asynchronous") {
      throw new Error(`Operation ${current.id} does not match its bound Endpoint`);
    }
    const endpoint = resolution.registration.endpoint;
    try {
      const context = {
        command: structuredClone(command), need: structuredClone(need),
        resources: this.#resourceStore(current.build),
        credentials: await this.#endpointCredentials(resolution.registration),
        operation: current.id, handle: structuredClone(current.handle), settling: true as const,
      };
      if (!current.cancellationRequested) {
        await pending("cancelling");
        const cancelled = await endpoint.cancel?.(context);
        if (cancelled?.status === "confirmed") return await operations.update(current.id, { status: "cancelled" });
        if (cancelled?.status === "accepted" && cancelled.wakeAt !== undefined && cancelled.wakeAt > Date.now()) {
          return await pending("cancelling", cancelled.wakeAt);
        }
      }
      const outcome = await endpoint.poll(context);
      if (outcome.status === "pending") return await pending("cancelling", outcome.wakeAt ?? Date.now() + 1_000, outcome.handle);
      return await operations.update(current.id, { status: "cancelled" });
    } catch {
      return await pending("cancellation-unconfirmed");
    }
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
        return { status: "paused", state, outcomes, blocked: [] };
      }
    }
  }
}

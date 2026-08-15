import { digestOf, reduce, resolveProducer } from "@narratage/core";
import type { ProducerHandlerResult } from "@narratage/component-kit";
import type { EndpointFulfillment } from "@narratage/endpoint-kit";
import type {
  BuildEvent,
  BuildState,
  CoreCommand,
  Digest,
  FulfillNeedCommand,
  InvokeProducerCommand,
  TypedRecord,
} from "@narratage/protocol";
import {
  TypeValidatorRegistry,
  validateValue,
} from "@narratage/validation";
import type { TypeValidatorRegistryLike } from "@narratage/validation";
import {
  operationCancellationRequestId,
  sealOperationIdentity,
  verifyOperationSnapshot,
} from "@narratage/runtime";
import type {
  OperationCancellationControl,
  OperationIdentity,
  CredentialStore,
  CredentialValue,
  OperationSnapshot,
  OperationStore,
  RuntimeExecutionContext,
  RuntimeExecutionResult,
  RuntimePreparation,
  RuntimeRunnableCommand,
} from "@narratage/runtime";

import { MemoryArtifactStore } from "./artifacts.js";
import {
  ProducerRegistry,
  EndpointRegistry,
  producerRegistryKey,
  endpointCapabilityKey,
  endpointReturnKey,
} from "./registry.js";
import type {
  ArtifactStore,
  BlockedCommand,
  DriverExecutionOutcome,
  DriverRunResult,
  EndpointRegistration,
} from "./types.js";

export type NodeDriverOptions = {
  readonly producers?: ProducerRegistry;
  readonly endpoints?: EndpointRegistry;
  readonly artifacts?: ArtifactStore;
  readonly operations?: OperationStore;
  readonly credentials?: CredentialStore;
  readonly validators?: TypeValidatorRegistryLike;
};

type Executable =
  | {
      readonly command: InvokeProducerCommand;
      readonly resources: readonly import("@narratage/runtime").RuntimeResourceClaim[];
      readonly run: () => Promise<ProducerHandlerResult>;
    }
  | {
      readonly command: FulfillNeedCommand;
      readonly endpointId: string;
      readonly resources: readonly import("@narratage/runtime").RuntimeResourceClaim[];
      readonly queue?: import("@narratage/runtime").RuntimeQueueLane;
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
  readonly artifacts: ArtifactStore;
  readonly operations: OperationStore | undefined;
  readonly credentials: CredentialStore | undefined;
  readonly validators: TypeValidatorRegistryLike;

  constructor(options: NodeDriverOptions = {}) {
    this.producers = options.producers ?? new ProducerRegistry();
    this.endpoints = options.endpoints ?? new EndpointRegistry();
    this.artifacts = options.artifacts ?? new MemoryArtifactStore();
    this.operations = options.operations;
    this.credentials = options.credentials;
    this.validators = options.validators ?? new TypeValidatorRegistry();
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
          resources: registration.scheduling?.resources ?? [{
            id: `producer:${producerRegistryKey(command.producer)}`,
            maxActive: Number.MAX_SAFE_INTEGER,
            maxInFlight: Number.MAX_SAFE_INTEGER,
          }],
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
    if (registration.kind === "recoverable" && this.operations === undefined) {
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
        resources: registration.scheduling?.resources ?? [{
          id: `endpoint:${registration.id}`,
          maxActive: 1,
          maxInFlight: 1,
        }],
        ...(registration.scheduling?.queue === undefined ? {} : { queue: registration.scheduling.queue }),
        registration,
      },
    };
  }

  async #endpointEvent(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    result: EndpointFulfillment,
  ): Promise<BuildEvent> {
    await validateValue(
      state.program.closure,
      executable.command.need.returns,
      result.value,
      this.validators,
    );
    const content = {
      kind: "need-fulfilled",
      command: executable.command.id,
      value: result.value,
      requestDigest: executable.command.need.requestDigest,
      fulfiller: executable.endpointId,
    } as const;
    return { ...content, id: `event:${digestOf(content)}` };
  }

  async #completedOperation(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    snapshot: OperationSnapshot,
    expectedOperation: string,
    maxAttempts: number,
  ): Promise<RuntimeExecutionResult> {
    verifyOperationSnapshot(snapshot);
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
      if (failure.retryable && snapshot.attempt < maxAttempts) {
        return {
          status: "pending",
          operation: snapshot.id,
          ...(failure.retryAt === undefined ? {} : { wakeAt: failure.retryAt }),
        };
      }
      const content = {
        kind: "command-failed",
        command: executable.command.id,
        code: failure.code,
        message: failure.message,
      } as const;
      return {
        status: "completed",
        event: { ...content, id: `event:${digestOf(content)}` },
      };
    }
    if (snapshot.status === "cancelled") {
      const content = {
        kind: "command-failed",
        command: executable.command.id,
        code: "CANCELLED",
        message: `Operation ${snapshot.id} was cancelled by the Runtime pool`,
      } as const;
      return {
        status: "completed",
        event: { ...content, id: `event:${digestOf(content)}` },
      };
    }
    return {
      status: "pending",
      operation: snapshot.id,
      ...(snapshot.wakeAt === undefined ? {} : { wakeAt: snapshot.wakeAt }),
    };
  }

  #assertOperationHistory(
    history: readonly OperationSnapshot[],
    expected: Omit<OperationIdentity, "format" | "id" | "attempt">,
  ): void {
    history.forEach((snapshot, index) => {
      verifyOperationSnapshot(snapshot);
      if (snapshot.attempt !== index + 1
        || snapshot.build !== expected.build
        || snapshot.command !== expected.command
        || snapshot.endpoint !== expected.endpoint
        || snapshot.pool !== expected.pool
        || snapshot.lane !== expected.lane) {
        throw new Error(`Operation history for ${expected.command} is not one contiguous retry chain`);
      }
    });
  }

  async #executeEndpoint(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    if (executable.registration.kind !== "recoverable") throw new Error("Endpoint is not recoverable");
    const operations = this.operations;
    if (operations === undefined) throw new Error("recoverable Endpoint requires OperationStore");
    if (executable.queue === undefined) throw new Error("recoverable Endpoint has no Provider pool/lane");
    const base = {
      build: context.build,
      command: executable.command.id,
      endpoint: executable.endpointId,
      pool: executable.queue.pool,
      lane: executable.queue.lane,
    } as const;
    const maxAttempts = executable.registration.retry?.maxAttempts ?? 1;
    const history = await operations.list({
      build: base.build,
      command: base.command,
      endpoint: base.endpoint,
    });
    this.#assertOperationHistory(history, base);
    let latest = history.at(-1);
    if (latest?.status === "completed" || latest?.status === "cancelled") {
      return await this.#completedOperation(state, executable, latest, latest.id, maxAttempts);
    }
    if (latest?.status === "pending" && latest.wakeAt !== undefined && latest.wakeAt > Date.now()) {
      return { status: "pending", operation: latest.id, wakeAt: latest.wakeAt };
    }
    if (latest?.status === "failed") {
      const failure = latest.failure;
      if (failure === undefined || !failure.retryable || latest.attempt >= maxAttempts) {
        return await this.#completedOperation(state, executable, latest, latest.id, maxAttempts);
      }
      if (failure.retryAt !== undefined && failure.retryAt > Date.now()) {
        return { status: "pending", operation: latest.id, wakeAt: failure.retryAt };
      }
      latest = undefined;
    }
    const attempt = history.length + (latest === undefined ? 1 : 0);
    const identity = sealOperationIdentity({ ...base, attempt });
    const created = await operations.create(identity);
    const current = created.snapshot;
    verifyOperationSnapshot(current);
    if (current.id !== identity.id) {
      throw new Error(`OperationStore returned ${current.id} for ${identity.id}`);
    }
    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
      return await this.#completedOperation(state, executable, current, identity.id, maxAttempts);
    }
    const endpointContext = {
      command: structuredClone(executable.command),
      need: structuredClone(executable.command.need),
      artifacts: this.artifacts,
      credentials: await this.#endpointCredentials(executable.registration),
      operation: structuredClone(identity),
    };
    const outcome = created.status === "created"
      ? await executable.registration.endpoint.start(endpointContext)
      : await executable.registration.endpoint.resume({
          ...endpointContext,
          checkpoint: current.status === "pending" ? structuredClone(current.checkpoint) : undefined,
        });
    if (outcome.status === "pending") {
      const written = await operations.compareAndSwap(identity.id, current.revision, {
        status: "pending",
        checkpoint: outcome.checkpoint,
        ...(outcome.wakeAt === undefined ? {} : { wakeAt: outcome.wakeAt }),
        ...(outcome.progress === undefined ? {} : { progress: outcome.progress }),
      });
      return await this.#completedOperation(
        state,
        executable,
        written.status === "stored" ? written.snapshot : written.current,
        identity.id,
        maxAttempts,
      );
    }
    if (outcome.status === "failed") {
      const written = await operations.compareAndSwap(identity.id, current.revision, {
        status: "failed",
        failure: outcome.failure,
      });
      return await this.#completedOperation(
        state,
        executable,
        written.status === "stored" ? written.snapshot : written.current,
        identity.id,
        maxAttempts,
      );
    }
    const written = await operations.compareAndSwap(identity.id, current.revision, {
      status: "completed",
      completion: outcome.result,
    });
    return await this.#completedOperation(
      state,
      executable,
      written.status === "stored" ? written.snapshot : written.current,
      identity.id,
      maxAttempts,
    );
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
          event: { ...content, id: `event:${digestOf(content)}` },
        };
      } catch (error) {
        const producer = executable.command.producer;
        throw new Error(
          `Producer ${producer.module.name}@${producer.module.version}#${producer.name} failed: ${failureMessage(error)}`,
          { cause: error },
        );
      }
    }
    if (executable.registration.kind === "recoverable") {
      if (context === undefined) throw new Error("recoverable Endpoint execution requires a stable Build id");
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
        artifacts: this.artifacts,
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
        ...(("queue" in executable && executable.queue !== undefined) ? { queue: executable.queue } : {}),
        capacityMode: "endpointId" in executable && executable.registration.kind === "recoverable"
          ? "recoverable"
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

  /** Cancel one persisted external Operation without trusting serialized Command content. */
  async cancelOperation(
    initial: BuildState,
    operation: OperationSnapshot,
    requestedAt: number,
  ): Promise<OperationSnapshot> {
    verifyOperationSnapshot(operation);
    const operations = this.operations;
    if (operations === undefined) throw new Error("cancelling an Operation requires OperationStore");
    const requestId = operationCancellationRequestId(operation.id, requestedAt);
    const write = async (current: OperationSnapshot, update: import("@narratage/runtime").OperationUpdate) => {
      const result = await operations.compareAndSwap(current.id, current.revision, update);
      return result.status === "stored" ? result.snapshot : result.current;
    };
    let current = await operations.read(operation.id) ?? operation;
    while (current.cancellation === undefined) {
      const terminal = current.status === "completed" || current.status === "failed" || current.status === "cancelled";
      current = await write(current, {
        status: "control",
        cancellation: { requestedAt, requestId, status: terminal ? "too-late" : "requested", attempts: 0 },
      });
    }
    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") return current;
    const control = current.cancellation;
    if (control === undefined || control.requestId !== requestId) {
      throw new Error(`Operation ${operation.id} already has another cancellation request`);
    }
    const prepared = this.prepare(initial);
    const descriptor = prepared.runnable.find((item) => item.command.id === operation.command);
    if (descriptor === undefined) throw new Error(`Operation ${operation.id} Command is not currently runnable`);
    const classified = this.#classify(prepared.state, descriptor.command);
    const executable = classified.executable;
    if (executable === undefined || !("endpointId" in executable)
      || executable.endpointId !== operation.endpoint
      || executable.registration.kind !== "recoverable") {
      throw new Error(`Operation ${operation.id} does not match the regenerated Endpoint Command`);
    }
    const identity: OperationIdentity = {
      format: operation.format,
      id: operation.id,
      build: operation.build,
      command: operation.command,
      endpoint: operation.endpoint,
      pool: operation.pool,
      lane: operation.lane,
      attempt: operation.attempt,
    };
    const endpointContext = {
      command: structuredClone(executable.command),
      need: structuredClone(executable.command.need),
      artifacts: this.artifacts,
      credentials: await this.#endpointCredentials(executable.registration),
      operation: identity,
      checkpoint: current.status === "pending" ? structuredClone(current.checkpoint) : undefined,
    };
    if (control.status === "requested" || control.status === "accepted") {
      if (executable.registration.endpoint.cancel === undefined) {
        current = await write(current, {
          status: "control",
          cancellation: { ...control, status: "unsupported", attempts: control.attempts + 1 },
        });
      } else if (control.retryAt === undefined || control.retryAt <= Date.now()) {
        try {
          const outcome = await executable.registration.endpoint.cancel(endpointContext);
          const nextControl: OperationCancellationControl = {
            requestedAt,
            requestId,
            status: outcome.status,
            attempts: control.attempts + 1,
            ...(outcome.status === "accepted" && outcome.wakeAt !== undefined ? { retryAt: outcome.wakeAt } : {}),
          };
          current = outcome.status === "confirmed"
            ? await write(current, { status: "cancelled", cancellation: nextControl })
            : await write(current, { status: "control", cancellation: nextControl });
        } catch (error) {
          current = await write(current, {
            status: "control",
            cancellation: {
              ...control,
              attempts: control.attempts + 1,
              retryAt: Date.now() + 1_000,
              lastError: {
                code: "CANCEL_REQUEST_FAILED",
                message: error instanceof Error ? error.message : String(error),
              },
            },
          });
        }
      }
    }
    if (current.status === "cancelled" || current.cancellation?.status === "requested") return current;

    // Acknowledgement is not a terminal fact. Reconcile the same remote submission until it
    // either confirms cancellation through `cancel`, or naturally completes/fails.
    let observed: Awaited<ReturnType<typeof executable.registration.endpoint.resume>>;
    try {
      observed = await executable.registration.endpoint.resume({
        ...endpointContext,
        checkpoint: current.status === "pending" ? structuredClone(current.checkpoint) : undefined,
      });
    } catch (error) {
      const cancellation = current.cancellation;
      if (cancellation === undefined) throw error;
      return await write(current, {
        status: "control",
        cancellation: {
          ...cancellation,
          retryAt: Date.now() + 1_000,
          lastError: {
            code: "CANCEL_RECONCILE_FAILED",
            message: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
    if (observed.status === "pending") {
      return await write(current, {
        status: "pending",
        checkpoint: observed.checkpoint,
        ...(observed.wakeAt === undefined ? {} : { wakeAt: observed.wakeAt }),
        ...(observed.progress === undefined ? {} : { progress: observed.progress }),
      });
    }
    if (observed.status === "failed") {
      return await write(current, { status: "failed", failure: observed.failure });
    }
    return await write(current, { status: "completed", completion: observed.result });
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
          event: event.id,
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

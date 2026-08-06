import { digestOf, reduce, resolveProducer } from "@svml/core";
import type { ProducerHandlerResult } from "@svml/component-kit";
import type { EndpointFulfillment } from "@svml/endpoint-kit";
import type {
  BuildEvent,
  BuildState,
  CoreCommand,
  Digest,
  FulfillNeedCommand,
  InvokeProducerCommand,
  TypedRecord,
} from "@svml/protocol";
import {
  TypeValidatorRegistry,
  validateValue,
} from "@svml/validation";
import type { TypeValidatorRegistryLike } from "@svml/validation";
import {
  sealOperationIdentity,
  verifyOperationSnapshot,
} from "@svml/runtime";
import type {
  OperationIdentity,
  CredentialStore,
  CredentialValue,
  OperationSnapshot,
  OperationStore,
  RuntimeExecutionContext,
  RuntimeExecutionResult,
  RuntimePreparation,
} from "@svml/runtime";

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
  DriverJournalEntry,
  DriverRunResult,
  EndpointRegistration,
} from "./types.js";

export type NodeDriverOptions = {
  readonly producers?: ProducerRegistry;
  readonly endpoints?: EndpointRegistry;
  readonly artifacts?: ArtifactStore;
  readonly operations?: OperationStore;
  readonly credentials?: CredentialStore;
  readonly maxEvents?: number;
  readonly validators?: TypeValidatorRegistryLike;
  readonly implementationClosure?: Digest;
};

type Executable =
  | {
      readonly command: InvokeProducerCommand;
      readonly lane: string;
      readonly maxConcurrency: number;
      readonly run: () => Promise<ProducerHandlerResult>;
    }
  | {
      readonly command: FulfillNeedCommand;
      readonly endpointId: string;
      readonly lane: string;
      readonly maxConcurrency: number;
      readonly registration: EndpointRegistration;
    };

export class NodeDriver {
  readonly producers: ProducerRegistry;
  readonly endpoints: EndpointRegistry;
  readonly artifacts: ArtifactStore;
  readonly operations: OperationStore | undefined;
  readonly credentials: CredentialStore | undefined;
  readonly maxEvents: number;
  readonly validators: TypeValidatorRegistryLike;
  readonly implementationClosure: Digest | undefined;

  constructor(options: NodeDriverOptions = {}) {
    this.producers = options.producers ?? new ProducerRegistry();
    this.endpoints = options.endpoints ?? new EndpointRegistry();
    this.artifacts = options.artifacts ?? new MemoryArtifactStore();
    this.operations = options.operations;
    this.credentials = options.credentials;
    this.maxEvents = options.maxEvents ?? 1_000;
    this.validators = options.validators ?? new TypeValidatorRegistry();
    this.implementationClosure = options.implementationClosure;
  }

  #verifyImplementationClosure(state: BuildState): void {
    if (state.request.implementationClosure !== this.implementationClosure) {
      if (state.request.implementationClosure === undefined) {
        throw new Error("BuildRequest does not bind this Host's implementation package closure");
      }
      if (this.implementationClosure === undefined) {
        throw new Error("BuildRequest requires an implementation package closure that this Host did not load");
      }
      throw new Error("BuildRequest implementation package closure differs from this Host");
    }
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
    for (const [port, id] of Object.entries(command.inputs)) {
      const record = state.records.find((item) => item.id === id);
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
    if (command.kind === "complete") return {};
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
      const declaration = resolveProducer(state.program.closure, command.producer);
      if (registration.implementationDigest !== declaration.implementation.digest) {
        return {
          blocked: {
            command: command.id,
            reason: "implementation-mismatch",
            subject: producerRegistryKey(command.producer),
          },
        };
      }
      return {
        executable: {
          command,
          lane: registration.scheduling?.lane ?? `producer:${producerRegistryKey(command.producer)}`,
          maxConcurrency: registration.scheduling?.maxConcurrency ?? Number.MAX_SAFE_INTEGER,
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
    if (registration.kind === "recoverable" && this.endpoints.runtimeClosureDigest() === undefined) {
      return {
        blocked: {
          command: command.id,
          reason: "missing-runtime-closure",
          subject: registration.id,
        },
      };
    }
    return {
      executable: {
        command,
        endpointId: registration.id,
        lane: registration.scheduling?.lane ?? `endpoint:${registration.id}`,
        maxConcurrency: registration.scheduling?.maxConcurrency ?? 1,
        registration,
      },
    };
  }

  async #endpointEvent(
    state: BuildState,
    executable: Extract<Executable, { readonly endpointId: string }>,
    result: EndpointFulfillment,
  ): Promise<BuildEvent> {
    const validation = await validateValue(
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
      conformance: result.conformance,
      delivery: result.delivery,
      metadata: result.metadata,
      ...(validation === undefined ? {} : { validation }),
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
    return {
      status: "pending",
      operation: snapshot.id,
      ...(snapshot.wakeAt === undefined ? {} : { wakeAt: snapshot.wakeAt }),
    };
  }

  #assertOperationHistory(
    history: readonly OperationSnapshot[],
    expected: Omit<OperationIdentity, "format" | "id" | "attempt" | "submissionKey">,
  ): void {
    history.forEach((snapshot, index) => {
      verifyOperationSnapshot(snapshot);
      if (snapshot.attempt !== index + 1
        || snapshot.build !== expected.build
        || snapshot.command !== expected.command
        || snapshot.endpoint !== expected.endpoint
        || snapshot.implementationDigest !== expected.implementationDigest
        || snapshot.runtimeClosure !== expected.runtimeClosure
        || snapshot.requestDigest !== expected.requestDigest) {
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
    const runtimeClosure = this.endpoints.runtimeClosureDigest();
    if (runtimeClosure === undefined) throw new Error("recoverable Endpoint requires Runtime Closure");
    const implementation = executable.registration.runtimeImplementation;
    if (implementation === undefined) throw new Error("recoverable Endpoint has no implementation identity");
    const base = {
      build: context.build,
      command: executable.command.id,
      endpoint: executable.endpointId,
      implementationDigest: implementation.digest,
      runtimeClosure,
      requestDigest: executable.command.need.requestDigest,
    } as const;
    const maxAttempts = executable.registration.retry?.maxAttempts ?? 1;
    const history = await operations.list({
      build: base.build,
      command: base.command,
      endpoint: base.endpoint,
      runtimeClosure: base.runtimeClosure,
      requestDigest: base.requestDigest,
    });
    this.#assertOperationHistory(history, base);
    let latest = history.at(-1);
    if (latest?.status === "completed") {
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
    if (current.status === "completed" || current.status === "failed") {
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
    const result: EndpointFulfillment = {
      ...outcome.result,
      metadata: {
        endpoint: structuredClone(outcome.result.metadata),
        runtime: {
          operation: identity.id,
          submissionKey: identity.submissionKey,
          closure: runtimeClosure,
          implementation: implementation.digest,
        },
      },
    };
    const written = await operations.compareAndSwap(identity.id, current.revision, {
      status: "completed",
      completion: result,
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
      const result = (await executable.run()) as ProducerHandlerResult;
      const producer = resolveProducer(state.program.closure, executable.command.producer);
      const validations: Record<string, NonNullable<Awaited<ReturnType<typeof validateValue>>>> = {};
      for (const port of producer.outputs) {
        const value = result.outputs[port.name];
        if (value === undefined) continue;
        const validation = await validateValue(state.program.closure, port.type, value, this.validators);
        if (validation !== undefined) validations[port.name] = validation;
      }
      const content = {
        kind: "producer-completed",
        command: executable.command.id,
        outputs: result.outputs,
        needs: result.needs,
        validations,
      } as const;
      return {
        status: "completed",
        event: { ...content, id: `event:${digestOf(content)}` },
      };
    }
    if (executable.registration.kind === "recoverable") {
      if (context === undefined) throw new Error("recoverable Endpoint execution requires a stable Build id");
      return await this.#executeEndpoint(state, executable, context);
    }
    const result = await executable.registration.handler({
      command: structuredClone(executable.command),
      need: structuredClone(executable.command.need),
      artifacts: this.artifacts,
      credentials: await this.#endpointCredentials(executable.registration),
    });
    return { status: "completed", event: await this.#endpointEvent(state, executable, result) };
  }

  /** Regenerate Core commands, then classify only what this Host can execute. */
  prepare(initial: BuildState): RuntimePreparation {
    this.#verifyImplementationClosure(initial);
    const transition = reduce(initial);
    const state = transition.state;
    if (state.status === "complete" || state.status === "failed") {
      return { state, runnable: [], blocked: [] };
    }
    const classifications = transition.commands.map((command) => ({
      command,
      ...this.#classify(state, command),
    }));
    return {
      state,
      runnable: classifications.flatMap(({ executable }) => executable === undefined ? [] : [{
        command: executable.command,
        lane: executable.lane,
        maxConcurrency: executable.maxConcurrency,
      }]),
      blocked: classifications
        .map((item) => item.blocked)
        .filter((item): item is BlockedCommand => item !== undefined),
    };
  }

  /** Execute one command regenerated from trusted state; callers never supply serialized command content. */
  async executeCommand(
    initial: BuildState,
    commandId: string,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    const prepared = this.prepare(initial);
    const descriptor = prepared.runnable.find((item) => item.command.id === commandId);
    if (descriptor === undefined) throw new Error(`command ${commandId} is not currently executable`);
    const classified = this.#classify(prepared.state, descriptor.command);
    if (classified.executable === undefined) throw new Error(`command ${commandId} is no longer executable`);
    return await this.#execute(prepared.state, classified.executable, context);
  }

  /** Cancel one journaled external Operation without trusting serialized Command content. */
  async cancelOperation(initial: BuildState, operation: OperationSnapshot): Promise<OperationSnapshot> {
    verifyOperationSnapshot(operation);
    if (operation.status === "completed" || operation.status === "failed") return operation;
    const operations = this.operations;
    if (operations === undefined) throw new Error("cancelling an Operation requires OperationStore");
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
    if (executable.registration.endpoint.cancel === undefined) {
      throw new Error(`Endpoint ${executable.endpointId} does not support cancellation`);
    }
    const identity: OperationIdentity = {
      format: operation.format,
      id: operation.id,
      build: operation.build,
      command: operation.command,
      endpoint: operation.endpoint,
      implementationDigest: operation.implementationDigest,
      runtimeClosure: operation.runtimeClosure,
      requestDigest: operation.requestDigest,
      attempt: operation.attempt,
      submissionKey: operation.submissionKey,
    };
    await executable.registration.endpoint.cancel({
      command: structuredClone(executable.command),
      need: structuredClone(executable.command.need),
      artifacts: this.artifacts,
      credentials: await this.#endpointCredentials(executable.registration),
      operation: identity,
      checkpoint: operation.status === "pending" ? structuredClone(operation.checkpoint) : undefined,
    });
    const written = await operations.compareAndSwap(operation.id, operation.revision, {
      status: "failed",
      failure: {
        code: "CANCELLED",
        message: `Operation ${operation.id} was cancelled by the Runtime authority`,
        retryable: false,
      },
    });
    return written.status === "stored" ? written.snapshot : written.current;
  }

  async run(initial: BuildState, context?: RuntimeExecutionContext): Promise<DriverRunResult> {
    this.#verifyImplementationClosure(initial);
    let state = initial;
    const journal: DriverJournalEntry[] = [];

    for (let processed = 0; processed < this.maxEvents; processed += 1) {
      const transition = reduce(state);
      state = transition.state;
      if (state.status === "complete") {
        return { status: "complete", state, journal, blocked: [] };
      }
      if (state.status === "failed") {
        return { status: "failed", state, journal, blocked: [] };
      }

      const classifications = transition.commands.map((command) => ({
        command,
        ...this.#classify(state, command),
      }));
      const selected = classifications.find((item) => item.executable !== undefined)?.executable;
      if (selected === undefined) {
        const blocked = classifications
          .map((item) => item.blocked)
          .filter((item): item is BlockedCommand => item !== undefined);
        journal.push(
          ...blocked.map((item) => ({
            command: item.command,
            kind: transition.commands.find((command) => command.id === item.command)?.kind ?? "fulfill-need",
            status: "blocked" as const,
            message: `${item.reason}: ${item.subject}`,
          })),
        );
        return { status: "paused", state, journal, blocked };
      }

      try {
        const execution = await this.#execute(state, selected, context);
        if (execution.status === "pending") {
          journal.push({
            command: selected.command.id,
            kind: selected.command.kind,
            status: "pending",
            operation: execution.operation,
            ...(execution.wakeAt === undefined ? {} : { wakeAt: execution.wakeAt }),
          });
          return { status: "paused", state, journal, blocked: [] };
        }
        const event = execution.event;
        const accepted = reduce(state, event);
        state = accepted.state;
        journal.push({
          command: selected.command.id,
          kind: selected.command.kind,
          status: "completed",
          event: event.id,
        });
      } catch (error) {
        journal.push({
          command: selected.command.id,
          kind: selected.command.kind,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        return { status: "paused", state, journal, blocked: [] };
      }
    }

    return { status: "paused", state, journal, blocked: [] };
  }
}

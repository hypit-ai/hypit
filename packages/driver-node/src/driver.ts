import { digestOf, reduce, resolveProducer } from "@svml/core";
import type {
  BuildEvent,
  BuildState,
  CoreCommand,
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
  OperationSnapshot,
  OperationStore,
  RuntimeExecutionContext,
  RuntimeExecutionResult,
  RuntimePreparation,
} from "@svml/runtime";

import { MemoryArtifactStore } from "./artifacts.js";
import {
  HostRegistry,
  ProviderRegistry,
  producerRegistryKey,
  providerCapabilityKey,
  providerReturnKey,
} from "./registry.js";
import type {
  ArtifactStore,
  BlockedCommand,
  DriverJournalEntry,
  DriverRunResult,
  ProducerHandlerResult,
  ProviderRegistration,
  ProviderHandlerResult,
} from "./types.js";

export type NodeDriverOptions = {
  readonly registry?: HostRegistry;
  readonly providers?: ProviderRegistry;
  readonly artifacts?: ArtifactStore;
  readonly operations?: OperationStore;
  readonly maxEvents?: number;
  readonly validators?: TypeValidatorRegistryLike;
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
      readonly providerId: string;
      readonly lane: string;
      readonly maxConcurrency: number;
      readonly registration: ProviderRegistration;
    };

export class NodeDriver {
  readonly registry: HostRegistry;
  readonly providers: ProviderRegistry;
  readonly artifacts: ArtifactStore;
  readonly operations: OperationStore | undefined;
  readonly maxEvents: number;
  readonly validators: TypeValidatorRegistryLike;

  constructor(options: NodeDriverOptions = {}) {
    this.registry = options.registry ?? new HostRegistry();
    this.providers = options.providers ?? new ProviderRegistry();
    this.artifacts = options.artifacts ?? new MemoryArtifactStore();
    this.operations = options.operations;
    this.maxEvents = options.maxEvents ?? 1_000;
    this.validators = options.validators ?? new TypeValidatorRegistry();
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
      const registration = this.registry.producer(command.producer);
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
              artifacts: this.artifacts,
            }),
        },
      };
    }

    const resolution = this.providers.resolve(command.need);
    if (resolution.status === "missing") {
      return {
        blocked: {
          command: command.id,
          reason: "missing-provider",
          subject: resolution.providerId === undefined
            ? `${providerCapabilityKey(command.need.capability)} -> ${providerReturnKey(command.need.returns)}`
            : `${providerCapabilityKey(command.need.capability)} -> ${resolution.providerId}`,
        },
      };
    }
    if (resolution.status === "ambiguous") {
      return {
        blocked: {
          command: command.id,
          reason: "ambiguous-provider",
          subject: `${providerCapabilityKey(command.need.capability)} -> ${resolution.providerIds.join(", ")}`,
        },
      };
    }
    const registration = resolution.registration;
    if (registration.kind === "endpoint" && this.operations === undefined) {
      return {
        blocked: {
          command: command.id,
          reason: "missing-operation-store",
          subject: registration.id,
        },
      };
    }
    if (registration.kind === "endpoint" && this.providers.runtimeClosureDigest() === undefined) {
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
        providerId: registration.id,
        lane: registration.scheduling?.lane ?? `provider:${registration.id}`,
        maxConcurrency: registration.scheduling?.maxConcurrency ?? 1,
        registration,
      },
    };
  }

  async #providerEvent(
    state: BuildState,
    executable: Extract<Executable, { readonly providerId: string }>,
    result: ProviderHandlerResult,
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
      fulfiller: executable.providerId,
      conformance: result.conformance,
      delivery: result.delivery,
      metadata: result.metadata,
      ...(validation === undefined ? {} : { validation }),
    } as const;
    return { ...content, id: `event:${digestOf(content)}` };
  }

  async #completedOperation(
    state: BuildState,
    executable: Extract<Executable, { readonly providerId: string }>,
    snapshot: OperationSnapshot,
    expectedOperation: string,
  ): Promise<RuntimeExecutionResult> {
    verifyOperationSnapshot(snapshot);
    if (snapshot.id !== expectedOperation) {
      throw new Error(`OperationStore returned ${snapshot.id} for ${expectedOperation}`);
    }
    if (snapshot.status === "completed" && snapshot.completion !== undefined) {
      return {
        status: "completed",
        event: await this.#providerEvent(state, executable, snapshot.completion),
      };
    }
    if (snapshot.status === "failed") {
      throw new Error(`Operation ${snapshot.id} failed: ${snapshot.failure?.code ?? "UNKNOWN"}`);
    }
    return { status: "pending", operation: snapshot.id };
  }

  async #executeEndpoint(
    state: BuildState,
    executable: Extract<Executable, { readonly providerId: string }>,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    if (executable.registration.kind !== "endpoint") throw new Error("Provider is not a recoverable Endpoint");
    const operations = this.operations;
    if (operations === undefined) throw new Error("recoverable Provider Endpoint requires OperationStore");
    const runtimeClosure = this.providers.runtimeClosureDigest();
    if (runtimeClosure === undefined) throw new Error("recoverable Provider Endpoint requires Runtime Closure");
    const implementation = executable.registration.runtimeImplementation;
    if (implementation === undefined) throw new Error("recoverable Provider Endpoint has no implementation identity");
    const identity = sealOperationIdentity({
      build: context.build,
      command: executable.command.id,
      endpoint: executable.providerId,
      implementationDigest: implementation.digest,
      runtimeClosure,
      requestDigest: executable.command.need.requestDigest,
      attempt: 1,
    });
    const created = await operations.create(identity);
    const current = created.snapshot;
    verifyOperationSnapshot(current);
    if (current.id !== identity.id) {
      throw new Error(`OperationStore returned ${current.id} for ${identity.id}`);
    }
    if (current.status === "completed" || current.status === "failed") {
      return await this.#completedOperation(state, executable, current, identity.id);
    }
    const endpointContext = {
      command: structuredClone(executable.command),
      need: structuredClone(executable.command.need),
      artifacts: this.artifacts,
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
      });
      return await this.#completedOperation(
        state,
        executable,
        written.status === "stored" ? written.snapshot : written.current,
        identity.id,
      );
    }
    const result: ProviderHandlerResult = {
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
    );
  }

  async #execute(
    state: BuildState,
    executable: Executable,
    context?: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    if (!("providerId" in executable)) {
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
    if (executable.registration.kind === "endpoint") {
      if (context === undefined) throw new Error("recoverable Endpoint execution requires a stable Build id");
      return await this.#executeEndpoint(state, executable, context);
    }
    const result = await executable.registration.handler({
      command: structuredClone(executable.command),
      need: structuredClone(executable.command.need),
      artifacts: this.artifacts,
    });
    return { status: "completed", event: await this.#providerEvent(state, executable, result) };
  }

  /** Regenerate Core commands, then classify only what this Host can execute. */
  prepare(initial: BuildState): RuntimePreparation {
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

  async run(initial: BuildState, context?: RuntimeExecutionContext): Promise<DriverRunResult> {
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

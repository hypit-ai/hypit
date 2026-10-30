import { resolveProducer } from "@hypit/kernel";
import type { BuildView } from "@hypit/kernel";
import type { ProducerExecutionLimits, ProducerHandlerResult } from "@hypit/producer";
import type { EndpointCredential, EndpointOutcome } from "@hypit/endpoint";
import { endpointResourceClaims } from "@hypit/endpoint";
import type {
  CommandResult,
  BuildCommand,
  FulfillNeedCommand,
  InvokeProducerCommand,
  TypedRecord,
  Value,
} from "@hypit/protocol";
import { capabilityKey, producerKey, typeKey } from "@hypit/protocol";
import {
  RefinementRegistry,
  refineValue,
} from "@hypit/refinement";
import type { RefinementRegistryLike } from "@hypit/refinement";
import type {
  ResourceStore,
  CredentialStore,
  CredentialValue,
  OperationSnapshot,
  OperationProgress,
  OperationStore,
  RuntimeBuildExecution,
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
} from "./registry.js";
import type {
  BlockedCommand,
  EndpointRegistration,
} from "./types.js";

export type ExecutorOptions = {
  readonly producers?: ProducerRegistry;
  readonly endpoints?: EndpointRegistry;
  readonly resources?: ResourceStore;
  /** Runtime execution may isolate transient bytes by Build without exposing that policy to Endpoints. */
  readonly resourcesForBuild?: (build: string) => ResourceStore;
  readonly operations?: OperationStore;
  readonly credentials?: CredentialStore;
  readonly refinements?: RefinementRegistryLike;
  readonly actions?: import("@hypit/runtime").RuntimeActionExecutor;
  /** Host policy for one pure Producer invocation. */
  readonly producerExecutionLimits?: ProducerExecutionLimits;
};

export const defaultProducerExecutionLimits: ProducerExecutionLimits = Object.freeze({
  maxInlineValueBytes: 8 * 1024 * 1024,
});

function producerExecutionLimits(value: ProducerExecutionLimits | undefined): ProducerExecutionLimits {
  const limits = value ?? defaultProducerExecutionLimits;
  if (!Number.isSafeInteger(limits.maxInlineValueBytes) || limits.maxInlineValueBytes <= 0) {
    throw new Error("Producer maxInlineValueBytes must be a positive safe integer");
  }
  return Object.freeze({ maxInlineValueBytes: limits.maxInlineValueBytes });
}

function assertProducerInlineValue(value: Value, limits: ProducerExecutionLimits): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Producer returned a Value that cannot be serialized");
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > limits.maxInlineValueBytes) {
    throw new Error(`Producer returned ${bytes} inline Value bytes; limit is ${limits.maxInlineValueBytes} bytes`);
  }
}

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

type CommandClassification =
  | { readonly status: "executable"; readonly executable: Executable }
  | { readonly status: "blocked"; readonly blocked: BlockedCommand };

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

function endpointRequest(need: FulfillNeedCommand["need"]): import("@hypit/endpoint").EndpointRequest {
  return {
    capability: structuredClone(need.capability),
    returns: structuredClone(need.returns),
    constraints: structuredClone(need.constraints),
  };
}

export class Executor {
  readonly producers: ProducerRegistry;
  readonly endpoints: EndpointRegistry;
  readonly resources: ResourceStore;
  readonly #resourcesForBuild: ((build: string) => ResourceStore) | undefined;
  readonly operations: OperationStore | undefined;
  readonly credentials: CredentialStore | undefined;
  readonly refinements: RefinementRegistryLike;
  readonly #actions: import("@hypit/runtime").RuntimeActionExecutor | undefined;
  readonly #producerExecutionLimits: ProducerExecutionLimits;
  readonly #credentialReads = new Map<string, Promise<CredentialValue | undefined>>();

  constructor(options: ExecutorOptions = {}) {
    this.producers = options.producers ?? new ProducerRegistry();
    this.endpoints = options.endpoints ?? new EndpointRegistry();
    this.resources = options.resources ?? new MemoryResourceStore();
    this.#resourcesForBuild = options.resourcesForBuild;
    this.operations = options.operations;
    this.credentials = options.credentials;
    this.refinements = options.refinements ?? new RefinementRegistry();
    this.#actions = options.actions;
    this.#producerExecutionLimits = producerExecutionLimits(options.producerExecutionLimits);
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
      Object.defineProperty(resolved, slot, {
        value: {
          ...value,
          ...(writable === undefined ? {} : {
            replace: async (replacement: CredentialValue) => await writable.put(ref, replacement),
          }),
        },
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return resolved;
  }

  #producerInputs(
    state: BuildView,
    command: InvokeProducerCommand,
    indexedRecord?: (id: string) => TypedRecord | undefined,
  ): Record<string, TypedRecord> {
    const inputs: Record<string, TypedRecord> = {};
    const records = indexedRecord === undefined ? new Map(state.records.map((item) => [item.id, item])) : undefined;
    for (const [port, id] of Object.entries(command.inputs)) {
      const record = indexedRecord?.(id) ?? records?.get(id);
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
    state: BuildView,
    command: BuildCommand,
    indexedRecord?: (id: string) => TypedRecord | undefined,
  ): CommandClassification {
    if (command.kind === "invoke-producer") {
      const handler = this.producers.producer(command.producer);
      if (handler === undefined) {
        return {
          status: "blocked",
          blocked: {
            command: command.id,
            reason: "missing-producer",
            subject: producerKey(command.producer),
            step: command.step,
            producer: structuredClone(command.producer),
          },
        };
      }
      return {
        status: "executable",
        executable: {
          command,
          resources: [],
          run: async () =>
            handler({
              command: structuredClone(command),
              inputs: this.#producerInputs(state, command, indexedRecord),
              limits: this.#producerExecutionLimits,
            }),
        },
      };
    }

    const selection = this.endpoints.select(command.need);
    if (selection.status === "missing") {
      return {
        status: "blocked",
        blocked: {
          command: command.id,
          reason: "missing-endpoint",
            need: structuredClone(command.need),
          subject: selection.endpointId === undefined
            ? `${capabilityKey(command.need.capability)} -> ${typeKey(command.need.returns)}`
            : `${capabilityKey(command.need.capability)} -> ${selection.endpointId}`,
        },
      };
    }
    if (selection.status === "ambiguous") {
      return {
        status: "blocked",
        blocked: {
          command: command.id,
          reason: "ambiguous-endpoint",
            need: structuredClone(command.need),
          subject: `${capabilityKey(command.need.capability)} -> ${selection.endpointIds.join(", ")}`,
        },
      };
    }
    const registration = selection.registration;
    const support = this.endpoints.checkSupport(registration, command.need);
    if (support.status === "unsupported") {
      return {
        status: "blocked",
        blocked: {
          command: command.id,
          reason: "unsupported-endpoint-request",
            need: structuredClone(command.need),
          subject: `${registration.id}: ${support.reason}`,
        },
      };
    }
    if (registration.kind === "asynchronous" && this.operations === undefined) {
      return {
        status: "blocked",
        blocked: {
          command: command.id,
          reason: "missing-operation-store",
            need: structuredClone(command.need),
          subject: registration.id,
        },
      };
    }
    return {
      status: "executable",
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
    executable: Extract<Executable, { readonly endpointId: string }>,
    value: Value,
  ): Promise<CommandResult> {
    await refineValue(
      executable.command.need.returns,
      value,
      this.refinements,
    );
    return {
      kind: "need-fulfilled",
      command: executable.command.id,
      value,
    } as const;
  }

  async acceptOperation(
    execution: RuntimeBuildExecution,
    snapshot: OperationSnapshot,
  ): Promise<CommandResult | undefined> {
    const state = execution.view();
    if (snapshot.status === "received" || snapshot.status === "completed") {
      const command = state.outstanding.find((item) => item.id === snapshot.command);
      if (command?.kind !== "fulfill-need") return undefined;
      await refineValue(command.need.returns, snapshot.value, this.refinements);
      return { kind: "need-fulfilled", command: snapshot.command, value: snapshot.value };
    }
    if (snapshot.status === "failed") {
      const failure = snapshot.failure;
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

  async completeOperation(id: string): Promise<void> {
    const operation = await this.operations?.read(id);
    if (operation?.status !== "received") return;
    await this.operations!.update(id, {
      status: "completed",
      value: operation.value,
      acknowledgedAt: operation.acknowledgedAt,
      endedAt: operation.endedAt,
    });
  }

  async #executeEndpoint(
    execution: RuntimeBuildExecution,
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
      id: `op_${crypto.randomUUID()}`, build: context.build, command: executable.command.id,
      endpoint: executable.endpointId, status: "queued", createdAt: Date.now(),
      need: structuredClone(executable.command.need),
      credentials: structuredClone(executable.registration.credentials ?? {}),
      ...(executable.registration.pool === undefined ? {} : { pool: executable.registration.pool }),
      wakeAt: Date.now(), progress: { phase: "ready-to-submit" },
    });
    if (operation.status === "queued" || operation.status === "submitting"
      || operation.status === "running" || operation.status === "collecting") {
      operation = await this.#advanceOperation(operation, executable.registration, context);
    }
    if (operation.status === "queued" || operation.status === "collecting"
      || operation.status === "received" || operation.status === "completed"
      || operation.status === "failed" || operation.status === "cancelled") {
      await context.releaseOperationCapacity?.();
    }
    const event = await this.acceptOperation(execution, operation);
    const nextWakeAt = operation.status === "queued" || operation.status === "running" || operation.status === "collecting"
      ? operation.wakeAt : undefined;
    return event === undefined ? {
      status: "pending", operation: operation.id,
      ...(nextWakeAt === undefined ? {} : { wakeAt: nextWakeAt }),
    } : { status: "completed", event, operation: operation.id };
  }

  async #advanceOperation(
    operation: OperationSnapshot,
    registration: EndpointRegistration,
    runtimeContext: RuntimeExecutionContext,
  ): Promise<OperationSnapshot> {
    const result = await this.#advanceOperationStep(operation, registration, runtimeContext);
    if (result.status === "failed" && operation.status !== "failed") {
      await runtimeContext.recordExecution?.({ endpoint: operation.endpoint, kind: "failed", message: result.failure!.message });
    } else if (result.status === "received") {
      await runtimeContext.recordExecution?.({ endpoint: operation.endpoint, kind: "completed" });
    } else if (result.progress?.phase !== undefined && result.progress.phase !== operation.progress?.phase) {
      await runtimeContext.recordExecution?.({ endpoint: operation.endpoint, kind: "phase", phase: result.progress.phase });
    }
    return result;
  }

  #endpointObservers(endpoint: string, context?: RuntimeExecutionContext) {
    let phase: string | undefined;
    return {
      reportProgress: async (progress: OperationProgress) => {
        await context?.reportProgress?.({ endpoint, progress });
        if (progress.phase !== phase) {
          phase = progress.phase;
          await context?.recordExecution?.({ endpoint, kind: "phase", phase });
        }
      },
      ...(context?.recordExecution === undefined ? {} : {
        reportDiagnostic: (diagnostic: import("@hypit/runtime").ExecutionDiagnostic) =>
          context.recordExecution!({ endpoint, kind: "diagnostic", ...diagnostic }),
      }),
    };
  }

  async #advanceOperationStep(
    operation: OperationSnapshot,
    registration: EndpointRegistration,
    runtimeContext: RuntimeExecutionContext,
  ): Promise<OperationSnapshot> {
    const operations = this.operations!;
    if (registration.kind !== "asynchronous") throw new Error("Operation Endpoint is not asynchronous");
    if (operation.status === "received" || operation.status === "completed"
      || operation.status === "failed" || operation.status === "cancelled") return operation;
    const wakeAt = operation.status === "queued" || operation.status === "running" || operation.status === "collecting"
      ? operation.wakeAt : undefined;
    if ((wakeAt ?? 0) > Date.now()) return operation;
    const endpoint = registration.endpoint;
    if (operation.status === "submitting") {
      return await operations.update(operation.id, {
        status: "failed", failure: { code: "SUBMISSION_INTERRUPTED",
          message: "Submission ended without a task receipt; this execution attempt has failed" }, endedAt: Date.now(),
      });
    }
    const action: import("@hypit/endpoint").EndpointAction = operation.status === "collecting" ? "collect"
      : operation.status === "running" ? "poll" : "submit";
    const actionHandle = operation.status === "running" || operation.status === "collecting" ? operation.handle : undefined;
    const actionAcknowledgedAt = operation.status === "running" || operation.status === "collecting"
      ? operation.acknowledgedAt : undefined;
    const actionEndedAt = operation.status === "collecting" ? operation.endedAt : undefined;
    const invoke = async (): Promise<EndpointOutcome> => {
      const context = {
        request: endpointRequest(operation.need),
        resources: this.#resourceStore(operation.build), operation: operation.id,
        credentials: await this.#endpointCredentials({ ...registration, credentials: operation.credentials }),
        ...this.#endpointObservers(operation.endpoint, runtimeContext),
        checkpoint: async (checkpoint: import("@hypit/endpoint").EndpointCheckpoint) => {
          const acknowledgedAt = operation.status === "running" || operation.status === "collecting"
            ? operation.acknowledgedAt : Date.now();
          await operations.update(operation.id, checkpoint.status === "ended"
            ? { status: "collecting", handle: checkpoint.handle, acknowledgedAt, endedAt: Date.now(),
                wakeAt: Date.now(), ...(checkpoint.receipt === undefined ? {} : { receipt: checkpoint.receipt }),
                progress: { phase: "collecting" } }
            : { status: "running", handle: checkpoint.handle, acknowledgedAt, wakeAt: Date.now(),
                ...(checkpoint.receipt === undefined ? {} : { receipt: checkpoint.receipt }),
                progress: { phase: "submitted" } });
          if (checkpoint.status === "ended") await runtimeContext.releaseOperationCapacity?.();
        },
      };
      if (action === "submit") {
        await operations.update(operation.id, { status: "submitting", progress: { phase: "submitting" } });
        await runtimeContext.recordExecution?.({ endpoint: operation.endpoint, kind: "started" });
        return await endpoint.start(context);
      }
      const pollContext = { ...context, handle: structuredClone(actionHandle!) };
      if (action === "collect") {
        await runtimeContext.recordExecution?.({ endpoint: operation.endpoint, kind: "phase", phase: "collecting" });
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
          ...(action === "submit"
            ? { status: "queued" as const }
            : action === "collect"
              ? { status: "collecting" as const, handle: actionHandle!, acknowledgedAt: actionAcknowledgedAt!, endedAt: actionEndedAt! }
              : { status: "running" as const, handle: actionHandle!, acknowledgedAt: actionAcknowledgedAt! }),
          ...(result.wakeAt === undefined ? {} : { wakeAt: result.wakeAt }),
          progress: { phase: "waiting-resource" },
        });
        outcome = result.value;
      } else outcome = await invoke();
    } catch (error) {
      const checkpointed = await operations.read(operation.id);
      if (action === "submit" && (checkpointed?.status === "running" || checkpointed?.status === "collecting")) {
        return checkpointed;
      }
      return await operations.update(operation.id, {
        status: "failed", failure: { code: "ENDPOINT_ACTION_FAILED",
          message: `${action} failed: ${failureMessage(error)}` }, endedAt: Date.now(),
      });
    }
    const recorded = await operations.read(operation.id) ?? operation;
    const receipt = outcome.receipt ?? recorded.receipt;
    const acknowledgedAt = recorded.status === "running" || recorded.status === "collecting"
      || recorded.status === "received" || recorded.status === "completed"
      ? recorded.acknowledgedAt : Date.now();
    const facts = receipt === undefined ? {} : { receipt };
    if (outcome.status === "pending") {
      return await operations.update(operation.id, {
        ...(action === "collect"
          ? { status: "collecting" as const, endedAt: recorded.status === "collecting" ? recorded.endedAt : Date.now() }
          : { status: "running" as const }),
        ...facts, acknowledgedAt, handle: outcome.handle,
        wakeAt: outcome.wakeAt ?? Date.now(),
        ...(outcome.progress === undefined ? {} : { progress: outcome.progress }),
      });
    }
    if (outcome.status === "ready") return await operations.update(operation.id, {
      status: "collecting", ...facts, acknowledgedAt, endedAt: Date.now(), handle: outcome.handle,
      wakeAt: Date.now(), progress: { phase: "ready-to-collect" },
    });
    if (outcome.status === "failed") return await operations.update(operation.id, {
      status: "failed", ...facts, failure: outcome.failure, endedAt: Date.now(),
    });
    return await operations.update(operation.id, {
      status: "received", ...facts, acknowledgedAt,
      endedAt: recorded.status === "collecting" ? recorded.endedAt : Date.now(),
      value: outcome.result, progress: { phase: "ready-to-accept" },
    });
  }

  async advanceOperation(operation: OperationSnapshot, context?: RuntimeExecutionContext): Promise<OperationSnapshot> {
    const selected = this.endpoints.select(operation.need);
    if (selected.status !== "resolved" || selected.registration.id !== operation.endpoint) {
      throw new Error(`Operation ${operation.id} cannot change its selected Endpoint ${operation.endpoint}`);
    }
    const support = this.endpoints.checkSupport(selected.registration, operation.need);
    if (support.status === "unsupported") {
      throw new Error(`Operation ${operation.id} request is no longer supported by ${operation.endpoint}: ${support.reason}`);
    }
    return await this.#advanceOperation(operation, selected.registration, context ?? { build: operation.build });
  }

  async #execute(
    execution: RuntimeBuildExecution,
    executable: Executable,
    context?: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    const state = execution.view();
    if (!("endpointId" in executable)) {
      try {
        const result = (await executable.run()) as ProducerHandlerResult;
        const producer = resolveProducer(state.program.closure, executable.command.producer);
        if (result.kind === "output") {
          const port = producer.result;
          if (port.kind !== "output") throw new Error("Producer returned an output but declares a Need");
          await refineValue(port.type, result.value, this.refinements);
          assertProducerInlineValue(result.value, this.#producerExecutionLimits);
        } else {
          assertProducerInlineValue(result.constraints, this.#producerExecutionLimits);
        }
        const content = {
          kind: "producer-completed",
          command: executable.command.id,
          result,
        } as const;
        return {
          status: "completed",
          event: content,
        };
      } catch (error) {
        const producer = executable.command.producer;
        throw new Error(
          `Producer ${producerKey(producer)} failed: ${failureMessage(error)}`,
          { cause: error },
        );
      }
    }
    if (executable.registration.kind === "asynchronous") {
      if (context === undefined) throw new Error("asynchronous Endpoint execution requires a stable Build id");
      try {
        return await this.#executeEndpoint(execution, executable, context);
      } catch (error) {
        await context.recordExecution?.({ endpoint: executable.endpointId, kind: "failed", message: failureMessage(error) });
        throw new Error(
          `Endpoint ${executable.endpointId} failed ${executable.command.need.capability.name}: ${failureMessage(error)}`,
          { cause: error },
        );
      }
    }
    await context?.recordExecution?.({ endpoint: executable.endpointId, kind: "started" });
    try {
      const result = await executable.registration.handler({
        request: endpointRequest(executable.command.need),
        resources: this.#resourceStore(context?.build),
        credentials: await this.#endpointCredentials(executable.registration),
        ...this.#endpointObservers(executable.endpointId, context),
      });
      const event = await this.#endpointEvent(executable, result);
      await context?.recordExecution?.({ endpoint: executable.endpointId, kind: "completed" });
      return { status: "completed", event };
    } catch (error) {
      await context?.recordExecution?.({ endpoint: executable.endpointId, kind: "failed", message: failureMessage(error) });
      throw new Error(
        `Endpoint ${executable.endpointId} failed ${executable.command.need.capability.name}: ${failureMessage(error)}`,
        { cause: error },
      );
    }
  }

  #prepare(
    state: BuildView,
    commands: readonly BuildCommand[],
    indexedRecord?: (id: string) => TypedRecord | undefined,
  ): RuntimePreparation {
    if (state.status === "complete" || state.status === "failed") {
      return { state, runnable: [], blocked: [] };
    }
    const classifications = commands.map((command) => this.#classify(state, command, indexedRecord));
    return {
      state,
      runnable: classifications.flatMap((classification) => classification.status === "blocked" ? [] : [{
        command: classification.executable.command,
        resources: classification.executable.resources,
        capacityMode: "endpointId" in classification.executable && classification.executable.registration.kind === "asynchronous"
          ? "asynchronous"
          : "active",
      }]),
      blocked: classifications.flatMap((classification) =>
        classification.status === "blocked" ? [classification.blocked] : []),
    };
  }

  /** Classify the commands already generated by Core for what this Host can execute. */
  prepare(execution: RuntimeBuildExecution): RuntimePreparation {
    return this.#prepare(execution.view(), execution.commands(), (id) => execution.record(id));
  }

  /** Execute one command emitted by `prepare` in the same scheduling turn. */
  async executeCommand(
    execution: RuntimeBuildExecution,
    descriptor: RuntimeRunnableCommand,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult> {
    const state = execution.view();
    const classified = this.#classify(state, descriptor.command, (id) => execution.record(id));
    if (classified.status === "blocked") {
      throw new Error(`command ${descriptor.command.id} is no longer executable`);
    }
    return await this.#execute(execution, classified.executable, context);
  }

  /** Stop observing this Operation and make at most one explicit cancellation request. */
  async cancelOperation(operation: OperationSnapshot): Promise<OperationSnapshot> {
    const operations = this.operations;
    if (operations === undefined) throw new Error("cancelling an Operation requires OperationStore");
    const current = await operations.read(operation.id) ?? operation;
    if (current.status === "received" || current.status === "completed"
      || current.status === "failed" || current.status === "cancelled") return current;
    let cancellation: import("@hypit/runtime").OperationCancellation = { outcome: "unsupported" };
    if (current.status === "running") {
      try {
        const selected = this.endpoints.select(current.need);
        if (selected.status !== "resolved" || selected.registration.id !== current.endpoint
          || selected.registration.kind !== "asynchronous") throw new Error("Operation Endpoint changed");
        const support = this.endpoints.checkSupport(selected.registration, current.need);
        if (support.status === "unsupported") throw new Error(`Operation request is unsupported: ${support.reason}`);
        const result = await selected.registration.endpoint.cancel?.({
          request: endpointRequest(current.need), operation: current.id, handle: current.handle,
          resources: this.#resourceStore(current.build),
          credentials: await this.#endpointCredentials(selected.registration),
        });
        cancellation = { outcome: result?.status ?? "unsupported" };
      } catch (error) {
        cancellation = { outcome: "failed", message: failureMessage(error) };
      }
    }
    return await operations.update(current.id, { status: "cancelled", cancellation, endedAt: Date.now() });
  }

}

import { digestOf, reduce, resolveProducer } from "@svml/core";
import type {
  BuildEvent,
  BuildState,
  CoreCommand,
  FulfillNeedCommand,
  InvokeProducerCommand,
  TypedRecord,
} from "@svml/protocol";

import { MemoryArtifactStore } from "./artifacts.js";
import { HostRegistry, producerRegistryKey, requirementRegistryKey } from "./registry.js";
import type {
  ArtifactStore,
  BlockedCommand,
  DriverJournalEntry,
  DriverRunResult,
  ProducerHandlerResult,
  RequirementHandlerResult,
} from "./types.js";

export type NodeDriverOptions = {
  readonly registry?: HostRegistry;
  readonly artifacts?: ArtifactStore;
  readonly maxEvents?: number;
};

type Executable =
  | {
      readonly command: InvokeProducerCommand;
      readonly run: () => Promise<ProducerHandlerResult>;
    }
  | {
      readonly command: FulfillNeedCommand;
      readonly run: () => Promise<RequirementHandlerResult>;
    };

export class NodeDriver {
  readonly registry: HostRegistry;
  readonly artifacts: ArtifactStore;
  readonly maxEvents: number;

  constructor(options: NodeDriverOptions = {}) {
    this.registry = options.registry ?? new HostRegistry();
    this.artifacts = options.artifacts ?? new MemoryArtifactStore();
    this.maxEvents = options.maxEvents ?? 1_000;
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

    const registration = this.registry.requirement(command.need.wants);
    if (registration === undefined) {
      return {
        blocked: {
          command: command.id,
          reason: "missing-handler",
          subject: requirementRegistryKey(command.need.wants),
        },
      };
    }
    return {
      executable: {
        command,
        run: async () =>
          registration.handler({
            command: structuredClone(command),
            need: structuredClone(command.need),
            artifacts: this.artifacts,
          }),
      },
    };
  }

  async #execute(executable: Executable): Promise<BuildEvent> {
    if (executable.command.kind === "invoke-producer") {
      const result = (await executable.run()) as ProducerHandlerResult;
      return {
        kind: "producer-completed",
        id: `event:${digestOf({
          kind: "producer-completed",
          command: executable.command.id,
          result,
        })}`,
        command: executable.command.id,
        outputs: result.outputs,
        needs: result.needs,
      };
    }

    const result = (await executable.run()) as RequirementHandlerResult;
    return {
      kind: "need-fulfilled",
      id: `event:${digestOf({
        kind: "need-fulfilled",
        command: executable.command.id,
        result,
      })}`,
      command: executable.command.id,
      value: result.value,
      requestDigest: executable.command.need.requestDigest,
      fulfiller: result.fulfiller,
      conformance: result.conformance,
      delivery: result.delivery,
      metadata: result.metadata,
    };
  }

  async run(initial: BuildState): Promise<DriverRunResult> {
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
        const event = await this.#execute(selected);
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

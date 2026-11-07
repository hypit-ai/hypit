import { randomUUID } from "node:crypto";
import { BuildMachine } from "@hypit/kernel";
import type { BuildView } from "@hypit/kernel";
import { isStreamingResourceStore } from "@hypit/resource-store";
import type {
  OperationSnapshot,
} from "@hypit/runtime";
import type { BuildExecutionSnapshot } from "./execution.js";
import { compareCodeUnits, type CommandResult } from "@hypit/protocol";
import type { BuildResultOperation } from "@hypit/result";
import type { RunFinalizationFinish, RunFinalizer, StoredBuildResult } from "./result-storage/types.js";

import type {
  CreateLocalRunFinalizerOptions,
  LocalRunFinalizer,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function operationEvent(operation: OperationSnapshot): CommandResult | undefined {
  if (operation.status === "queued" || operation.status === "submitting"
    || operation.status === "running" || operation.status === "collecting") return undefined;
  if (operation.status === "received" || operation.status === "completed") {
    return {
      kind: "need-fulfilled",
      command: operation.command,
      value: operation.value,
    };
  }
  if (operation.status === "failed") {
    return {
      kind: "command-failed",
      command: operation.command,
      code: operation.failure.code,
      message: operation.failure.message,
    };
  }
  return {
    kind: "command-failed",
    command: operation.command,
    code: "CANCELLED",
    message: `Operation ${operation.id} was cancelled by the Runtime capacity controller`,
  };
}

function resultOperation(operation: OperationSnapshot): BuildResultOperation | undefined {
  const evidence = {
    request: operation.need.id,
    endpoint: operation.endpoint,
    ...(operation.receipt === undefined ? {} : { receipt: operation.receipt }),
  };
  return operation.status === "failed"
    ? { ...evidence, outcome: "failed", failure: operation.failure }
    : operation.status === "cancelled"
      ? { ...evidence, outcome: "cancelled", cancellation: operation.cancellation }
      : operation.status === "queued" || operation.status === "submitting"
        ? undefined
        : operation.status === "running" || operation.status === "collecting"
          ? { ...evidence, outcome: "unsettled" }
          : { ...evidence, outcome: "complete" };
}

function resultFinish(
  decision: NonNullable<BuildExecutionSnapshot["decision"]>,
  evidence: Omit<RunFinalizationFinish, "outcome" | "failure">,
): RunFinalizationFinish {
  if (decision.outcome === "complete") return { ...evidence, outcome: "complete" };
  return {
    ...evidence,
    outcome: decision.outcome,
    failure: decision.reason,
  };
}

/**
 * Run finalization only consumes already accepted execution facts and transient bytes. It cannot load
 * Producers or Endpoints and it never changes the frozen execution decision.
 */
export function createLocalRunFinalizer(
  options: CreateLocalRunFinalizerOptions,
): LocalRunFinalizer {
  const owner = randomUUID();
  const openFinalizer = async (execution: BuildExecutionSnapshot): Promise<{
    readonly finalizer: RunFinalizer;
    readonly manifest: StoredBuildResult;
    close(): Promise<void>;
  }> => {
    const opened = await options.openPublicationStores(execution.publicationStores);
    try {
      const [finalizer, manifest] = await Promise.all([
        opened.finalization.openFinalizer(execution.build),
        opened.finalization.readStored(execution.build),
      ]);
      assert(finalizer !== undefined && manifest !== undefined, `Build ${execution.build} has no Result draft`);
      return {
        finalizer,
        manifest,
        close: async () => await opened.close?.(),
      };
    } catch (error) {
      await opened.close?.();
      throw error;
    }
  };

  const acceptStoredResults = async (build: string): Promise<BuildView> => {
    const snapshot = await options.buildStore.read(build);
    assert(snapshot !== undefined, `Build ${build} has no durable execution state`);
    const machine = new BuildMachine(snapshot.definition, snapshot.facts);
    const accept = async (event: CommandResult): Promise<boolean> => {
      if (!machine.view().outstanding.some((command) => command.id === event.command)) return true;
      const fact = machine.evaluate(event);
      if (fact === undefined) return false;
      await options.buildStore.append(build, fact);
      machine.commit();
      return true;
    };
    const commandEvents = (await options.commandExecutionStore.list(build)).flatMap((receipt) =>
      receipt.status === "completed" ? [receipt.event] : []);
    const operationEvents = (await options.operationStore.list({ build })).flatMap((operation) => {
      const event = operationEvent(operation);
      return event === undefined ? [] : [{ operation, event }];
    });
    // Preserve already validated sibling outputs before a failure closes Core's outstanding work.
    for (const event of commandEvents.filter((event) => event.kind !== "command-failed")) await accept(event);
    for (const { operation, event } of operationEvents.filter(({ event }) => event.kind !== "command-failed")) {
      if (await accept(event) && operation.status === "received") {
        await options.operationStore.update(operation.id, {
          status: "completed",
          value: operation.value,
          acknowledgedAt: operation.acknowledgedAt,
          endedAt: operation.endedAt,
        });
      }
    }
    for (const event of commandEvents.filter((event) => event.kind === "command-failed")) await accept(event);
    for (const { event } of operationEvents.filter(({ event }) => event.kind === "command-failed")) await accept(event);
    return machine.view();
  };

  const syncPublications = async (
    execution: BuildExecutionSnapshot,
    records: readonly import("@hypit/protocol").TypedRecord[],
  ): Promise<void> => {
    const result = await openFinalizer(execution);
    try {
      if ("outcome" in result.manifest) return;
      const resources = options.resourceStoreForBuild?.(execution.build) ?? options.resourceStore;
      await result.finalizer.sync({
        records,
        resources: {
          open: async (artifact) => {
            if (isStreamingResourceStore(resources)) return await resources.open(artifact.resource);
            const bytes = await resources.get(artifact.resource);
            return bytes === undefined ? undefined : (async function* () { yield bytes; })();
          },
        },
      });
    } finally {
      await result.close();
    }
  };

  const finishRun = async (execution: BuildExecutionSnapshot): Promise<void> => {
    assert(execution.decision !== undefined, `Execution ${execution.build} has no decision`);
    const opened = await openFinalizer(execution);
    let closed = false;
    try {
      if (!("outcome" in opened.manifest)) {
        await opened.close();
        closed = true;
        const state = await acceptStoredResults(execution.build);
        await syncPublications(execution, state.records);
        const reopened = await openFinalizer(execution);
        try {
          const operations = (await options.operationStore.list({ build: execution.build }))
            .flatMap((operation) => {
              const evidence = resultOperation(operation);
              return evidence === undefined ? [] : [evidence];
            })
            .sort((left, right) => compareCodeUnits(left.request, right.request));
          const executionLog = await options.executionLogs?.open(execution.build);
          await reopened.finalizer.finish(resultFinish(execution.decision, {
            ...(executionLog === undefined ? {} : { executionLog }),
            operations,
          }));
        } finally {
          await reopened.close();
        }
        return;
      }
      await opened.finalizer.finish(resultFinish(execution.decision, {}));
    } finally {
      if (!closed) await opened.close();
    }
  };

  const finalizeAndCleanup = async (execution: BuildExecutionSnapshot) => {
    assert(execution.decision !== undefined, `Execution ${execution.build} has no decision`);
    assert(execution.finalization?.owner === owner,
      `Execution ${execution.build} finalization is not owned by this process`);
    let step: "publication" | "cleanup" = "publication";
    try {
      await finishRun(execution);
      step = "cleanup";
      await Promise.resolve(options.clearBuildResources?.(execution.build));
      return await options.removeActiveBuild(execution.build);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      try {
        await options.executionStore.setAttention(execution.build, { step, error: reason });
      } catch (attentionError) {
        await options.executionStore.releaseFinalization(execution.build, owner).catch(() => undefined);
        throw attentionError;
      }
      return await options.executionStore.releaseFinalization(execution.build, owner);
    }
  };

  const claimFinalization = async (build: string): Promise<BuildExecutionSnapshot> => {
    const claimed = await options.executionStore.claimFinalization(build, owner);
    if (claimed !== undefined) return claimed;
    const current = await options.executionStore.read(build);
    assert(current !== undefined, `Execution ${build} does not exist`);
    assert(current.decision !== undefined, `Execution ${build} has no decision`);
    assert(current.finalization === undefined,
      `Execution ${build} finalization is already owned by another process`);
    throw new Error(`Execution ${build} could not be claimed for finalization`);
  };

  const finalize = async (initial: BuildExecutionSnapshot) =>
    await finalizeAndCleanup(await claimFinalization(initial.build));

  const discardSubmission = async (build: string): Promise<boolean> => {
    const submission = await options.submissionStore.read(build);
    if (submission === undefined) return false;
    const opened = await options.openPublicationStores(submission.publicationStores);
    try {
      await opened.finalization.removeIncomplete(build);
    } finally {
      await opened.close?.();
    }
    await Promise.resolve(options.clearBuildResources?.(build));
    await options.submissionStore.discard(build);
    return true;
  };

  return {
    sync: syncPublications,
    discardSubmission,
    finalize,
    close() {
      return options.close?.();
    },
  };
}

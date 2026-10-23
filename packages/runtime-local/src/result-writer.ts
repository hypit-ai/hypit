import { randomUUID } from "node:crypto";
import { BuildMachine } from "@hypit/hypit/kernel";
import { isStreamingResourceStore } from "@hypit/hypit/runtime";
import type {
  OperationSnapshot,
} from "@hypit/hypit/runtime";
import type { BuildExecutionSnapshot } from "./execution.js";
import type { BuildState, CommandResult } from "@hypit/hypit/protocol";
import type { BuildResultFinish, BuildResultOperation, BuildResultWriter } from "@hypit/hypit/result";

import type {
  CreateLocalResultWriterOptions,
  LocalResultWriter,
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

function resultOperation(operation: OperationSnapshot): BuildResultOperation {
  const evidence = {
    need: { id: operation.need.id, capability: operation.need.capability },
    createdAt: operation.createdAt,
    ...("acknowledgedAt" in operation ? { acknowledgedAt: operation.acknowledgedAt } : {}),
    ...("endedAt" in operation ? { endedAt: operation.endedAt } : {}),
    ...(operation.progress === undefined ? {} : { progress: operation.progress }),
    ...(operation.status === "cancelled" ? { cancellation: operation.cancellation } : {}),
    operation: operation.id,
    command: operation.command,
    endpoint: operation.endpoint,
    ...(operation.pool === undefined ? {} : { pool: operation.pool }),
    credentials: operation.credentials,
    ...(operation.receipt === undefined ? {} : { receipt: operation.receipt }),
  };
  return operation.status === "failed"
    ? { ...evidence, status: "failed", failure: operation.failure }
    : { ...evidence, status: operation.status === "queued" || operation.status === "submitting"
      || operation.status === "running" || operation.status === "collecting" ? "pending" : operation.status };
}

function resultFinish(
  decision: NonNullable<BuildExecutionSnapshot["decision"]>,
  evidence: Omit<BuildResultFinish, "outcome" | "failure">,
): BuildResultFinish {
  if (decision.outcome === "complete") return { ...evidence, outcome: "complete" };
  return {
    ...evidence,
    outcome: decision.outcome,
    failure: decision.reason,
  };
}

/**
 * Result writing only consumes already accepted execution facts and transient bytes. It cannot load
 * Producers or Endpoints and it never changes the frozen execution decision.
 */
export function createLocalResultWriter(
  options: CreateLocalResultWriterOptions,
): LocalResultWriter {
  const owner = randomUUID();
  const openWriter = async (execution: BuildExecutionSnapshot): Promise<{
    readonly writer: BuildResultWriter;
    readonly manifest: import("@hypit/hypit/result").BuildResultManifest;
    close(): Promise<void>;
  }> => {
    const opened = await options.openBuildResultRepository(execution.result);
    try {
      const [writer, manifest] = await Promise.all([
        opened.repository.openWriter(execution.build),
        opened.repository.read(execution.build),
      ]);
      assert(writer !== undefined && manifest !== undefined, `Build ${execution.build} has no Result draft`);
      return {
        writer,
        manifest,
        close: async () => await opened.close?.(),
      };
    } catch (error) {
      await opened.close?.();
      throw error;
    }
  };

  const acceptStoredResults = async (build: string): Promise<BuildState> => {
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

  const syncResult = async (
    execution: BuildExecutionSnapshot,
    records: readonly import("@hypit/hypit/protocol").TypedRecord[],
  ): Promise<void> => {
    const result = await openWriter(execution);
    try {
      if (result.manifest.outcome !== undefined) return;
      const resources = options.resourceStoreForBuild?.(execution.build) ?? options.resourceStore;
      await result.writer.sync({
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

  const finishResult = async (execution: BuildExecutionSnapshot): Promise<void> => {
    assert(execution.decision !== undefined, `Execution ${execution.build} has no decision`);
    const opened = await openWriter(execution);
    let closed = false;
    try {
      if (opened.manifest.outcome === undefined) {
        await opened.close();
        closed = true;
        const state = await acceptStoredResults(execution.build);
        await syncResult(execution, state.records);
        const reopened = await openWriter(execution);
        try {
          const operations = (await options.operationStore.list({ build: execution.build })).map(resultOperation);
          const executionLog = await options.executionLogs?.open(execution.build);
          await reopened.writer.finish(resultFinish(execution.decision, {
            ...(executionLog === undefined ? {} : { executionLog }),
            operations,
          }));
        } finally {
          await reopened.close();
        }
        return;
      }
      await opened.writer.finish(resultFinish(execution.decision, {}));
    } finally {
      if (!closed) await opened.close();
    }
  };

  const writeResultAndCleanup = async (execution: BuildExecutionSnapshot) => {
    assert(execution.decision !== undefined, `Execution ${execution.build} has no decision`);
    assert(execution.resultWrite?.owner === owner,
      `Execution ${execution.build} Result writer is not owned by this process`);
    let step: "result" | "cleanup" = "result";
    try {
      await finishResult(execution);
      step = "cleanup";
      await Promise.resolve(options.clearBuildResources?.(execution.build));
      return await options.removeActiveBuild(execution.build);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      try {
        await options.executionStore.setAttention(execution.build, { step, error: reason });
      } catch (attentionError) {
        await options.executionStore.releaseResultWrite(execution.build, owner).catch(() => undefined);
        throw attentionError;
      }
      return await options.executionStore.releaseResultWrite(execution.build, owner);
    }
  };

  const claimResultWrite = async (build: string): Promise<BuildExecutionSnapshot> => {
    const claimed = await options.executionStore.claimResultWrite(build, owner);
    if (claimed !== undefined) return claimed;
    const current = await options.executionStore.read(build);
    assert(current !== undefined, `Execution ${build} does not exist`);
    assert(current.decision !== undefined, `Execution ${build} has no decision`);
    assert(current.resultWrite === undefined,
      `Execution ${build} Result write is already owned by another process`);
    throw new Error(`Execution ${build} could not be claimed for Result writing`);
  };

  const completeResult = async (initial: BuildExecutionSnapshot) =>
    await writeResultAndCleanup(await claimResultWrite(initial.build));

  const discardSubmission = async (build: string): Promise<boolean> => {
    const submission = await options.submissionStore.read(build);
    if (submission === undefined) return false;
    const opened = await options.openBuildResultRepository(submission.result);
    try {
      await opened.repository.removeIncomplete(build);
    } finally {
      await opened.close?.();
    }
    await Promise.resolve(options.clearBuildResources?.(build));
    await options.submissionStore.discard(build);
    return true;
  };

  return {
    sync: syncResult,
    async finishResult(build) {
      const execution = await options.executionStore.read(build);
      if (execution === undefined) return undefined;
      assert(execution.decision !== undefined,
        `Build ${build} is still executing; its Result cannot be finished yet`);
      const finished = await writeResultAndCleanup(await claimResultWrite(build));
      return "createdAt" in finished
        ? {
            id: build,
            outcome: finished.decision!.outcome,
            ...(finished.attention === undefined ? {} : {
              issue: { scope: finished.attention.step, message: finished.attention.error },
            }),
          }
        : { id: build, outcome: finished.outcome };
    },
    discardSubmission,
    completeResult,
    close() {
      return options.close?.();
    },
  };
}

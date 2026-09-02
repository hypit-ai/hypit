import { randomUUID } from "node:crypto";
import { BuildMachine } from "@hypit/core";
import { isStreamingResourceStore } from "@hypit/runtime";
import type {
  BuildExecutionSnapshot,
  BuildSnapshot,
  OperationSnapshot,
} from "@hypit/runtime";
import type { CommandResult } from "@hypit/protocol";
import type { BuildResultWriter } from "@hypit/build-result";

import type {
  CreateLocalResultWriterOptions,
  LocalResultWriter,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function operationEvent(operation: OperationSnapshot): CommandResult | undefined {
  if (operation.status === "pending") return undefined;
  if (operation.status === "completed") {
    assert(operation.completion !== undefined, `Operation ${operation.id} has no completion`);
    return {
      kind: "need-fulfilled",
      command: operation.command,
      value: operation.completion.value,
    };
  }
  if (operation.status === "failed") {
    assert(operation.failure !== undefined, `Operation ${operation.id} has no failure`);
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
    message: `Operation ${operation.id} was cancelled by the Runtime pool`,
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
    readonly manifest: import("@hypit/build-result").BuildResultManifest;
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

  const acceptStoredResults = async (build: string): Promise<BuildSnapshot> => {
    const snapshot = await options.buildStore.read(build);
    assert(snapshot !== undefined, `Build ${build} has no durable execution state`);
    const machine = new BuildMachine(snapshot.definition, snapshot.facts);
    const accept = async (event: CommandResult): Promise<void> => {
      if (!machine.view().outstanding.some((command) => command.id === event.command)) return;
      const fact = machine.evaluate(event);
      if (fact === undefined) return;
      await options.buildStore.append(build, fact);
      machine.commit();
    };
    for (const receipt of await options.commandExecutionStore.list(build)) {
      if (receipt.status === "completed" && receipt.event !== undefined) await accept(receipt.event);
    }
    for (const operation of await options.operationStore.list({ build })) {
      const event = operationEvent(operation);
      if (event !== undefined) await accept(event);
    }
    const accepted = await options.buildStore.read(build);
    assert(accepted !== undefined, `Build ${build} disappeared while accepting stored results`);
    return accepted;
  };

  const syncResult = async (
    execution: BuildExecutionSnapshot,
    state: import("@hypit/protocol").BuildState,
  ): Promise<void> => {
    const result = await openWriter(execution);
    try {
      if (result.manifest.outcome !== undefined) return;
      const resources = options.resourceStoreForBuild?.(execution.build) ?? options.resourceStore;
      await result.writer.sync({
        state,
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
        const snapshot = await acceptStoredResults(execution.build);
        await syncResult(execution, snapshot.state);
        const reopened = await openWriter(execution);
        try {
          await reopened.writer.finish({
            outcome: execution.decision.outcome,
            ...(execution.decision.reason === undefined ? {} : { failure: execution.decision.reason }),
          });
        } finally {
          await reopened.close();
        }
        return;
      }
      await opened.writer.finish({
        outcome: execution.decision.outcome,
        ...(execution.decision.reason === undefined ? {} : { failure: execution.decision.reason }),
      });
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
      await opened.repository.remove(build);
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

import type {
  CreateLocalRuntimeControlOptions,
  LocalRuntimeControl,
} from "./types.js";
import { buildExecutionActivity } from "./execution.js";
import type {
  BuildSnapshot,
  OperationSnapshot,
} from "@hypit/hypit/runtime";
import type { PendingBuildSubmission } from "./submission.js";
import type { StoredBuildResult } from "@hypit/hypit/result/runtime-storage";
import type { BuildExecutionSnapshot } from "./execution.js";
import type { BuildView } from "./host-api.js";
import { buildIdCreatedAt, compareCodeUnits } from "@hypit/hypit/protocol";
import { materializeBuild } from "@hypit/hypit/kernel";

function buildView(input: {
  readonly build: string;
  readonly snapshot?: BuildSnapshot;
  readonly result?: StoredBuildResult;
  readonly submission?: PendingBuildSubmission;
  readonly execution?: BuildExecutionSnapshot;
  readonly operations: readonly OperationSnapshot[];
  readonly commands: readonly import("@hypit/hypit/runtime").CommandExecutionReceipt[];
}): BuildView | undefined {
  if (input.submission === undefined && input.execution === undefined) return undefined;
  const createdAt = buildIdCreatedAt(input.build);
  if (createdAt === undefined) throw new Error(`Active Build ${input.build} has no ordered public id`);
  const runtimeActivity = input.execution === undefined ? undefined : buildExecutionActivity(input.execution);
  const activity: BuildView["activity"] = input.submission !== undefined
    ? "submitting"
    : runtimeActivity!;
  const targets = input.result?.targets ?? [];
  const requests = input.snapshot === undefined ? undefined : {
    total: input.snapshot.definition.plan.steps.reduce(
      (total, step) => total + (step.result.kind === "need" ? 1 : 0),
      0,
    ),
    completed: input.snapshot.facts.filter((fact) => fact.kind === "need-applied").length,
  };
  const state = input.snapshot === undefined
    ? undefined
    : materializeBuild(input.snapshot.definition, input.snapshot.facts);
  return {
    id: input.build,
    createdAt,
    activity,
    ...(input.execution?.decision === undefined ? {} : { outcome: input.execution.decision.outcome }),
    ...(input.execution?.attention === undefined ? {} : {
      issue: { scope: input.execution.attention.step, message: input.execution.attention.error },
    }),
    ...(input.execution?.stop === undefined ? {} : { stop: input.execution.stop }),
    ...(input.result?.sourcePath === undefined ? {} : { sourcePath: input.result.sourcePath }),
    targets,
    ...(requests === undefined ? {} : { requests }),
    acceptedRecords: state?.records.length ?? 0,
    outstandingCommands: state?.outstanding.length ?? 0,
    commands: input.commands.flatMap((command) => command.status === "started" && command.activity !== undefined
      ? [{ id: command.command, ...command.activity }] : []),
    operations: input.operations.map((operation): BuildView["operations"][number] => {
      const evidence = {
        id: operation.id,
        endpoint: operation.endpoint,
        ...(operation.receipt === undefined ? {} : { receipt: operation.receipt }),
        ...("wakeAt" in operation && operation.wakeAt !== undefined ? { wakeAt: operation.wakeAt } : {}),
        ...(operation.progress === undefined ? {} : { progress: operation.progress }),
      };
      return operation.status === "failed"
        ? { ...evidence, status: "failed", failure: operation.failure }
        : { ...evidence, status: operation.status === "queued" || operation.status === "submitting"
          || operation.status === "running" || operation.status === "collecting" ? "pending" : operation.status };
    }),
  };
}

/** Active Runtime control that never opens or depends on a ResourceStore. */
export function createLocalRuntimeControl(
  options: CreateLocalRuntimeControlOptions,
): LocalRuntimeControl {
  const inspect = async (build: string): Promise<BuildView | undefined> => {
    const [snapshot, operations, submission, execution, commands] = await Promise.all([
      options.buildStore.read(build),
      options.operationStore.list({ build }),
      options.submissionStore.read(build),
      options.executionStore.read(build),
      options.commandExecutionStore.list(build),
    ]);
    const location = execution?.result ?? submission?.result;
    let result: StoredBuildResult | undefined;
    if (location !== undefined) {
      const opened = await options.openBuildResultRepository(location);
      try { result = await opened.repository.readStored(build); } finally { await opened.close?.(); }
    }
    return buildView({
      build,
      ...(snapshot === undefined ? {} : { snapshot }),
      ...(result === undefined ? {} : { result }),
      ...(submission === undefined ? {} : { submission }),
      ...(execution === undefined ? {} : { execution }),
      operations,
      commands,
    });
  };
  return {
    inspect,
    async logs(build, lines) {
      return await options.executionLogs?.read(build, lines);
    },
    async activity() {
      const [submissions, executions, capacity] = await Promise.all([
        options.submissionStore.list(),
        options.executionStore.list(),
        options.executionStore.listCapacity(),
      ]);
      return {
        builds: (await Promise.all([...submissions, ...executions].map(async (item) =>
          await inspect(item.build))))
          .filter((item): item is BuildView => item !== undefined)
          .sort((left, right) => compareCodeUnits(right.id, left.id)),
        capacity,
      };
    },
    async cancel(build, reason) {
      if (await options.executionStore.read(build) === undefined) return undefined;
      await options.executionStore.requestStop(build, {
        cause: "user-cancelled",
        reason: reason ?? "Cancelled by user",
      });
      return await inspect(build);
    },
    close() {
      return options.close?.();
    },
  };
}

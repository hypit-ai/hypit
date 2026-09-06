import type {
  CreateLocalRuntimeControlOptions,
  LocalRuntimeControl,
} from "./types.js";
import { buildExecutionActivity } from "@hypit/runtime";
import type {
  PendingBuildSubmission,
  BuildCatalogEntry,
  BuildExecutionSnapshot,
  BuildSnapshot,
  OperationSnapshot,
} from "@hypit/runtime";
import type { BuildView } from "@hypit/runtime-host-node";
import { buildIdCreatedAt } from "@hypit/protocol";

function buildView(input: {
  readonly build: string;
  readonly snapshot?: BuildSnapshot;
  readonly catalog?: BuildCatalogEntry;
  readonly submission?: PendingBuildSubmission;
  readonly execution?: BuildExecutionSnapshot;
  readonly operations: readonly OperationSnapshot[];
}): BuildView | undefined {
  if (input.submission === undefined && input.execution === undefined) return undefined;
  const createdAt = buildIdCreatedAt(input.build);
  if (createdAt === undefined) throw new Error(`Active Build ${input.build} has no ordered public id`);
  const runtimeActivity = input.execution === undefined ? undefined : buildExecutionActivity(input.execution);
  const activity: BuildView["activity"] = input.submission !== undefined
    ? "submitting"
    : runtimeActivity!;
  const names = new Map(input.catalog?.publishedOutputs.map((item) => [item.ref.id, item.name]) ?? []);
  const targets = input.snapshot?.state.targets.map((target) => {
    const name = names.get(target.output);
    if (name === undefined) throw new Error(`Build ${input.build} target ${target.output} has no published Output name`);
    return name;
  }) ?? [];
  const requests = input.snapshot === undefined ? undefined : {
    total: input.snapshot.definition.plan.steps.reduce(
      (total, step) => total + Object.keys(step.needs).length,
      0,
    ),
    completed: input.snapshot.facts.filter((fact) => fact.kind === "need-applied").length,
  };
  return {
    id: input.build,
    createdAt,
    activity,
    ...(input.execution?.decision === undefined ? {} : { outcome: input.execution.decision.outcome }),
    ...(input.execution?.attention === undefined ? {} : {
      issue: { scope: input.execution.attention.step, message: input.execution.attention.error },
    }),
    cancellationRequested: input.execution?.stop?.cause === "user-cancelled",
    ...(input.execution?.stop === undefined ? {} : { stop: input.execution.stop }),
    ...(input.catalog?.source === undefined ? {} : { source: input.catalog.source }),
    ...(input.catalog?.run === undefined ? {} : { run: input.catalog.run }),
    targets,
    ...(requests === undefined ? {} : { requests }),
    acceptedRecords: input.snapshot?.state.records.length ?? 0,
    outstandingCommands: input.snapshot?.state.outstanding.length ?? 0,
    operations: input.operations.map((operation) => ({
      id: operation.id,
      endpoint: operation.endpoint,
      ...(operation.receipt === undefined ? {} : { receipt: operation.receipt }),
      ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
      status: operation.status,
      ...(operation.progress === undefined ? {} : { progress: operation.progress }),
      ...(operation.failure === undefined ? {} : { failure: operation.failure }),
    })),
  };
}

/** Active Runtime control that never opens or depends on a ResourceStore. */
export function createLocalRuntimeControl(
  options: CreateLocalRuntimeControlOptions,
): LocalRuntimeControl {
  const buildCatalog = options.buildCatalog;
  const inspect = async (build: string): Promise<BuildView | undefined> => {
    const [snapshot, catalog, operations, submission, execution] = await Promise.all([
      options.buildStore.read(build),
      buildCatalog?.read(build),
      options.operationStore.list({ build }),
      options.submissionStore.read(build),
      options.executionStore.read(build),
    ]);
    return buildView({
      build,
      ...(snapshot === undefined ? {} : { snapshot }),
      ...(catalog === undefined ? {} : { catalog }),
      ...(submission === undefined ? {} : { submission }),
      ...(execution === undefined ? {} : { execution }),
      operations,
    });
  };
  return {
    inspect,
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
          .sort((left, right) => right.id.localeCompare(left.id)),
        capacity,
      };
    },
    async cancel(build, reason) {
      if (await options.executionStore.read(build) === undefined) return undefined;
      await options.executionStore.requestStop(build, { cause: "user-cancelled",
        ...(reason === undefined ? {} : { reason }) });
      return await inspect(build);
    },
    close() {
      return options.close?.();
    },
  };
}

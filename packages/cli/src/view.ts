import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  BuildResultManifest,
  BuildResultRepository,
  RepositoryBuildResultOutputDescription,
} from "@hypit/result";
import { buildResultOutput } from "@hypit/result";
import { buildIdCreatedAt } from "@hypit/protocol";
import type { TypeRef } from "@hypit/protocol";
import type { CliBuildView as BuildView } from "./runtime-port.js";
import { commandHint } from "./command-hint.js";
import type { CommandScope } from "./command-hint.js";

export type PublicOutputRepresentation = "inline" | "file" | "value-document";

/** Result capability used by CLI presentation; mutation and byte access stay outside this boundary. */
export type BuildResultDescriptionRepository = Pick<BuildResultRepository, "describeOutput">;

export type CliOutputView = {
  readonly name: string;
  readonly type: string;
  readonly representation: PublicOutputRepresentation;
  readonly target: boolean;
  readonly highlighted: boolean;
  readonly mediaType?: string;
  readonly size?: number;
};

export type CliBuildSummary = {
  readonly id: string;
  readonly title?: string;
  readonly createdAt: string;
  readonly outcome: "complete" | "failed" | "cancelled";
  readonly run?: string;
  readonly targetCount: number;
  readonly targets?: readonly string[];
  readonly omittedTargets?: number;
  readonly outputCount: number;
};

export type CliBuildResultView = {
  readonly id: string;
  readonly title?: string;
  readonly note?: string;
  readonly createdAt: string;
  readonly finishedAt?: string;
  readonly outcome: "open" | "complete" | "failed" | "cancelled";
  readonly source: string;
  readonly run?: string;
  readonly targetCount: number;
  readonly targets: readonly string[];
  readonly omittedTargets?: number;
  readonly outputs: readonly CliOutputView[];
  readonly outputCount: number;
  /** Available Outputs outside the selected inspection scope. */
  readonly otherOutputCount?: number;
  readonly omittedOutputs?: number;
  readonly failure?: string;
  readonly operations?: readonly Pick<NonNullable<BuildResultManifest["operations"]>[number],
    "endpoint" | "status" | "receipt" | "failure">[];
  readonly executionLog?: BuildResultManifest["executionLog"];
  readonly omittedOperations?: number;
};

export type CliBuildStatusView = {
  readonly id: string;
  readonly title?: string;
  readonly targets?: readonly string[];
  readonly failure?: string;
  readonly commands?: readonly {
    readonly id?: string;
    readonly endpoint: string;
    readonly progress: NonNullable<BuildView["commands"]>[number]["progress"];
  }[];
  readonly work: {
    readonly state: "unknown" | "submitting" | "working" | "done";
    readonly outcome?: "complete" | "failed" | "cancelled";
    readonly cancellationRequested?: boolean;
    readonly stop?: BuildView["stop"];
    readonly requests?: { readonly total: number; readonly completed: number };
  };
  readonly result: {
    readonly state: "missing" | "open" | "complete" | "failed" | "cancelled" | "unavailable";
    readonly outputCount?: number;
  };
  readonly attention?: { readonly message: string; readonly action?: string };
  readonly operations?: readonly {
    readonly count?: number;
    readonly id?: string;
    readonly receipt?: { readonly id: string; readonly url?: string };
    readonly endpoint: string;
    readonly state: string;
    readonly progress?: {
      readonly phase: string;
      readonly completed?: number;
      readonly total?: number;
      readonly unit?: string;
    };
    readonly failure?: { readonly code: string; readonly message: string };
  }[];
};

export function cliTypeName(type: TypeRef): string {
  return `${type.module.name}@${type.module.version}/${type.name}`;
}

export function projectPath(path: string, projectRoot: string): string {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(projectRoot, path);
  const local = relative(resolve(projectRoot), absolute);
  if (local.length === 0) return ".";
  if (local === ".." || local.startsWith(`..${sep}`)) return path;
  return local;
}

export function buildCreatedAtIso(build: string): string {
  const createdAt = buildIdCreatedAt(build);
  if (createdAt === undefined) throw new Error(`Build id ${build} has no submission time`);
  return new Date(createdAt).toISOString();
}

export async function outputView(
  repository: BuildResultDescriptionRepository,
  manifest: BuildResultManifest,
  name: string,
): Promise<CliOutputView> {
  const output = await repository.describeOutput(manifest.id, name);
  if (output === undefined) {
    throw new Error(`Build Result ${manifest.id} Output ${name} cannot be resolved`);
  }
  return {
    name,
    type: cliTypeName(output.type),
    representation: output.representation,
    target: manifest.targets.includes(name),
    highlighted: manifest.highlightedOutputs?.includes(name) === true,
    ...(output.representation === "file" ? {
      mediaType: output.mediaType,
      size: output.size,
    } : {}),
  };
}

function orderedOutputNames(manifest: BuildResultManifest): readonly string[] {
  const names = Object.keys(manifest.outputs);
  const highlighted = new Set(manifest.highlightedOutputs ?? []);
  const targets = new Set(manifest.targets);
  return names.sort((left, right) => {
    const leftRank = targets.has(left) ? 0 : highlighted.has(left) ? 1 : 2;
    const rightRank = targets.has(right) ? 0 : highlighted.has(right) ? 1 : 2;
    return leftRank - rightRank || left.localeCompare(right);
  });
}

function workState(view: BuildView | undefined, result: BuildResultManifest | undefined): CliBuildStatusView["work"]["state"] {
  if (view === undefined) return result?.outcome === undefined ? "unknown" : "done";
  if (view.activity === "submitting") return "submitting";
  if (view.activity === "ready" || view.activity === "running" || view.activity === "waiting") return "working";
  return "done";
}

export function buildStatusView(options: {
  readonly id: string;
  readonly runtime?: BuildView;
  readonly result?: BuildResultManifest;
  readonly resultReadError?: string;
  readonly verbose?: boolean;
  readonly commandScope?: CommandScope;
}): CliBuildStatusView {
  const resultState = options.resultReadError !== undefined
    ? "unavailable" as const
    : options.result?.outcome ?? (options.result === undefined ? "missing" as const : "open" as const);
  const issue = options.runtime?.issue;
  const operations = (options.runtime?.operations ?? options.result?.operations ?? [])
    .filter((item) => options.verbose || item.status !== "completed");
  return {
    id: options.id,
    ...((options.runtime?.targets ?? options.result?.targets) === undefined ? {} : {
      targets: options.runtime?.targets ?? options.result!.targets,
    }),
    ...((options.result?.failure ?? options.runtime?.stop?.reason) === undefined ? {} : {
      failure: options.result?.failure ?? options.runtime!.stop!.reason,
    }),
    ...(options.runtime?.commands?.length ? { commands: options.runtime.commands.map((command) => ({
      ...(options.verbose ? { id: command.id } : {}), endpoint: command.endpoint, progress: command.progress,
    })) } : {}),
    ...(options.result?.title === undefined ? {} : { title: options.result.title }),
    work: {
      state: workState(options.runtime, options.result),
      ...((options.runtime?.outcome ?? options.result?.outcome) === undefined
        ? {}
        : { outcome: options.runtime?.outcome ?? options.result!.outcome }),
      ...(options.runtime?.cancellationRequested === true ? { cancellationRequested: true } : {}),
      ...(options.runtime?.stop === undefined ? {} : { stop: options.runtime.stop }),
      ...(options.runtime?.requests === undefined ? {} : { requests: options.runtime.requests }),
    },
    result: {
      state: resultState,
      ...(options.result === undefined ? {} : { outputCount: Object.keys(options.result.outputs).length }),
    },
    ...(issue === undefined && options.resultReadError === undefined ? {} : {
      attention: issue !== undefined
        ? {
            message: issue.message,
            action: commandHint(["result", "finish", options.id], options.commandScope),
          }
        : { message: options.resultReadError! },
    }),
    ...(operations.length > 0 ? {
      operations: groupOperationViews(operations
        .map((item) => ({
          ...(!options.verbose ? {} : "operation" in item ? { id: item.operation } : item.id === undefined ? {} : { id: item.id }),
          ...(item.receipt === undefined || (!options.verbose && item.failure === undefined) ? {} : { receipt: item.receipt }),
          endpoint: item.endpoint,
          state: item.status,
          ...(item.progress === undefined ? {} : { progress: item.progress }),
          ...(item.failure === undefined ? {} : { failure: {
            code: item.failure.code,
            message: item.failure.message,
          } }),
        })), options.verbose === true),
    } : {}),
  };
}

function groupOperationViews(
  operations: NonNullable<CliBuildStatusView["operations"]>,
  verbose: boolean,
): NonNullable<CliBuildStatusView["operations"]> {
  if (verbose) return operations;
  const groups = new Map<string, { view: typeof operations[number]; count: number }>();
  for (const operation of operations) {
    const key = JSON.stringify(operation);
    const existing = groups.get(key);
    if (existing !== undefined) existing.count += 1;
    else groups.set(key, { view: operation, count: 1 });
  }
  return [...groups.values()].map(({ view, count }) => count === 1 ? view : { ...view, count });
}

export async function buildResultView(
  repository: BuildResultDescriptionRepository,
  manifest: BuildResultManifest,
  options: { readonly projectRoot: string; readonly output?: string; readonly limit: number; readonly verbose?: boolean },
): Promise<CliBuildResultView> {
  if (options.output !== undefined && buildResultOutput(manifest, options.output) === undefined) {
    throw new Error(`Build Result ${manifest.id} has no public Output ${options.output}`);
  }
  const available = orderedOutputNames(manifest);
  const allNames = options.output !== undefined ? [options.output] : options.verbose ? available
    : available.filter((name) => manifest.targets.includes(name) || manifest.highlightedOutputs?.includes(name));
  const selected = options.verbose ? allNames.slice(0, options.limit) : allNames;
  const outputs = await Promise.all(selected.map(async (name) =>
    await outputView(repository, manifest, name)));
  const operations = options.verbose ? manifest.operations ?? []
    : (manifest.operations ?? []).filter((item) => item.failure !== undefined);
  const selectedOperations = options.verbose ? operations.slice(0, options.limit) : operations;
  return {
    id: manifest.id,
    ...(manifest.title === undefined ? {} : { title: manifest.title }),
    ...(manifest.note === undefined ? {} : { note: manifest.note }),
    createdAt: buildCreatedAtIso(manifest.id),
    ...(manifest.finishedAt === undefined ? {} : { finishedAt: new Date(manifest.finishedAt).toISOString() }),
    outcome: manifest.outcome ?? "open",
    source: projectPath(manifest.source.id, options.projectRoot),
    ...(manifest.run === undefined ? {} : { run: projectPath(manifest.run.id, options.projectRoot) }),
    targetCount: manifest.targets.length,
    targets: manifest.targets,
    outputCount: available.length,
    outputs,
    ...(available.length === allNames.length ? {} : { otherOutputCount: available.length - allNames.length }),
    ...(selected.length === allNames.length ? {} : { omittedOutputs: allNames.length - selected.length }),
    ...(manifest.failure === undefined ? {} : { failure: manifest.failure }),
    ...(manifest.executionLog === undefined ? {} : { executionLog: manifest.executionLog }),
    ...(selectedOperations.length === 0 ? {} : { operations: selectedOperations.map((item) => options.verbose ? item : ({
      endpoint: item.endpoint, status: item.status,
      ...(item.receipt === undefined ? {} : { receipt: item.receipt }),
      ...(item.failure === undefined ? {} : { failure: item.failure }),
    })) }),
    ...(selectedOperations.length === operations.length ? {} : { omittedOperations: operations.length - selectedOperations.length }),
  };
}

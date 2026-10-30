import { isAbsolute, relative, resolve, sep } from "node:path";

import type { BuildResult, BuildResultOperation } from "@hypit/result";
import { buildResultOutput } from "@hypit/result";
import { buildIdCreatedAt, compareCodeUnits } from "@hypit/protocol";
import { typeKey } from "@hypit/protocol";
import type { TypeRef } from "@hypit/protocol";
import type { CliBuildView as BuildView } from "./runtime-port.js";
import type { CommandScope } from "./command-hint.js";

export type PublicOutputRepresentation = "inline" | "file" | "value-document";

export type CliOutputView = {
  readonly name: string;
  readonly type: string;
  readonly representation: PublicOutputRepresentation;
  readonly mediaType?: string;
  readonly size?: number;
};

export type CliBuildSummary = {
  readonly id: string;
  readonly source: string;
  readonly createdAt: string;
  readonly outcome: "complete" | "failed" | "cancelled";
  readonly targetCount: number;
  readonly targets?: readonly string[];
  readonly omittedTargets?: number;
  readonly outputCount: number;
};

export type CliBuildResultView = {
  readonly id: string;
  readonly createdAt: string;
  readonly finishedAt?: string;
  readonly outcome: "complete" | "failed" | "cancelled";
  readonly source: string;
  readonly targetCount: number;
  readonly targets: readonly string[];
  readonly omittedTargets?: number;
  readonly outputs: readonly CliOutputView[];
  readonly outputCount: number;
  readonly omittedOutputs?: number;
  readonly failure?: string;
  readonly operations?: readonly Pick<BuildResultOperation,
    "endpoint" | "outcome" | "receipt" | "failure">[];
  readonly executionLog?: BuildResult["executionLog"];
  readonly omittedOperations?: number;
};

export type CliBuildStatusView = {
  readonly id: string;
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
    readonly state: "missing" | "complete" | "failed" | "cancelled" | "unavailable";
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
  return typeKey(type);
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

export function outputView(
  manifest: BuildResult,
  name: string,
): CliOutputView {
  const output = buildResultOutput(manifest, name);
  if (output === undefined) {
    throw new Error(`Build Result ${manifest.id} Output ${name} cannot be resolved`);
  }
  const representation = output.value.kind === "build-file"
    ? "file" as const
    : output.value.kind === "value" ? "value-document" as const : "inline" as const;
  return {
    name,
    type: cliTypeName(output.type),
    representation,
    ...(output.value.kind === "build-file" ? {
      mediaType: output.value.mediaType,
      size: output.value.size,
    } : {}),
  };
}

function orderedOutputNames(manifest: BuildResult): readonly string[] {
  return Object.keys(manifest.outputs).sort(compareCodeUnits);
}

function workState(view: BuildView | undefined, result: BuildResult | undefined): CliBuildStatusView["work"]["state"] {
  if (view === undefined) return result === undefined ? "unknown" : "done";
  if (view.activity === "submitting") return "submitting";
  if (view.activity === "ready" || view.activity === "running" || view.activity === "waiting") return "working";
  return "done";
}

export function buildStatusView(options: {
  readonly id: string;
  readonly runtime?: BuildView;
  readonly result?: BuildResult;
  readonly resultReadError?: string;
  readonly verbose?: boolean;
  readonly commandScope?: CommandScope;
}): CliBuildStatusView {
  const finished = options.result;
  const resultState = options.resultReadError !== undefined
    ? "unavailable" as const
    : finished?.outcome ?? "missing" as const;
  const issue = options.runtime?.issue;
  const operations = (options.runtime?.operations ?? finished?.operations ?? [])
    .filter((item) => options.verbose || ("status" in item
      ? item.status !== "completed"
      : item.outcome !== "complete"));
  return {
    id: options.id,
    ...((options.runtime?.targets ?? options.result?.targets) === undefined ? {} : {
      targets: options.runtime?.targets ?? options.result!.targets,
    }),
    ...((finished?.failure ?? options.runtime?.stop?.reason) === undefined ? {} : {
      failure: finished?.failure ?? options.runtime!.stop!.reason,
    }),
    ...(options.runtime?.commands?.length ? { commands: options.runtime.commands.map((command) => ({
      ...(options.verbose ? { id: command.id } : {}), endpoint: command.endpoint, progress: command.progress,
    })) } : {}),
    work: {
      state: workState(options.runtime, options.result),
      ...((options.runtime?.outcome ?? finished?.outcome) === undefined
        ? {}
        : { outcome: options.runtime?.outcome ?? finished!.outcome }),
      ...(options.runtime?.stop?.cause === "user-cancelled" ? { cancellationRequested: true } : {}),
      ...(options.runtime?.stop === undefined ? {} : { stop: options.runtime.stop }),
      ...(options.runtime?.requests === undefined ? {} : { requests: options.runtime.requests }),
    },
    result: {
      state: resultState,
      ...(options.result === undefined ? {} : { outputCount: Object.keys(options.result.outputs).length }),
    },
    ...(issue === undefined && options.resultReadError === undefined ? {} : {
      attention: issue !== undefined
        ? { message: issue.message }
        : { message: options.resultReadError! },
    }),
    ...(operations.length > 0 ? {
      operations: groupOperationViews(operations
        .map((item) => ({
          ...(!options.verbose || !("id" in item) || item.id === undefined ? {} : { id: item.id }),
          ...(item.receipt === undefined || (!options.verbose && item.failure === undefined) ? {} : { receipt: item.receipt }),
          endpoint: item.endpoint,
          state: "status" in item ? item.status : item.outcome ?? "accepted",
          ...(!("progress" in item) || item.progress === undefined ? {} : { progress: item.progress }),
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
  manifest: BuildResult,
  options: { readonly projectRoot: string; readonly output?: string; readonly limit: number; readonly verbose?: boolean },
): Promise<CliBuildResultView> {
  if (options.output !== undefined && buildResultOutput(manifest, options.output) === undefined) {
    throw new Error(`Build Result ${manifest.id} has no retained Output ${options.output}`);
  }
  const available = orderedOutputNames(manifest);
  const allNames = options.output === undefined ? available : [options.output];
  const selected = options.output === undefined ? allNames.slice(0, options.limit) : allNames;
  const outputs = selected.map((name) => outputView(manifest, name));
  const finished = manifest;
  const operations = options.verbose ? finished?.operations ?? []
    : (finished?.operations ?? []).filter((item) => item.failure !== undefined);
  const selectedOperations = options.verbose ? operations.slice(0, options.limit) : operations;
  return {
    id: manifest.id,
    createdAt: buildCreatedAtIso(manifest.id),
    finishedAt: new Date(finished.finishedAt).toISOString(),
    outcome: finished.outcome,
    source: projectPath(manifest.sourcePath, options.projectRoot),
    targetCount: manifest.targets.length,
    targets: manifest.targets,
    outputCount: available.length,
    outputs,
    ...(selected.length === allNames.length ? {} : { omittedOutputs: allNames.length - selected.length }),
    ...(finished?.failure === undefined ? {} : { failure: finished.failure }),
    ...(finished?.executionLog === undefined ? {} : { executionLog: finished.executionLog }),
    ...(selectedOperations.length === 0 ? {} : { operations: selectedOperations.map((item) => options.verbose ? item : ({
      endpoint: item.endpoint,
      ...(item.outcome === undefined ? {} : { outcome: item.outcome }),
      ...(item.receipt === undefined ? {} : { receipt: item.receipt }),
      ...(item.failure === undefined ? {} : { failure: item.failure }),
    })) }),
    ...(selectedOperations.length === operations.length ? {} : { omittedOperations: operations.length - selectedOperations.length }),
  };
}

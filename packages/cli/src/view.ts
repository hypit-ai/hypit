import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  BuildResultManifest,
  BuildResultRepository,
  RepositoryBuildResultOutputDescription,
} from "@hypit/build-result";
import { buildIdCreatedAt } from "@hypit/protocol";
import type { TypeRef } from "@hypit/protocol";
import type { BuildView } from "@hypit/runtime-host-node";

export type PublicOutputKind = "scalar" | "resource" | "composite";

export type CliOutputView = {
  readonly name: string;
  readonly type: string;
  readonly kind: PublicOutputKind;
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
  readonly omittedOutputs?: number;
  readonly failure?: string;
  readonly operations?: BuildResultManifest["operations"];
  readonly omittedOperations?: number;
};

export type CliBuildStatusView = {
  readonly id: string;
  readonly title?: string;
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
  repository: BuildResultRepository,
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
    kind: output.kind,
    target: manifest.targets.includes(name),
    highlighted: manifest.highlightedOutputs?.includes(name) === true,
    ...(output.kind === "resource" ? {
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
    const leftRank = highlighted.has(left) ? 0 : targets.has(left) ? 1 : 2;
    const rightRank = highlighted.has(right) ? 0 : targets.has(right) ? 1 : 2;
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
  readonly operationLimit?: number;
}): CliBuildStatusView {
  const resultState = options.resultReadError !== undefined
    ? "unavailable" as const
    : options.result?.outcome ?? (options.result === undefined ? "missing" as const : "open" as const);
  const issue = options.runtime?.issue;
  return {
    id: options.id,
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
            ...(issue.scope === "result" ? { action: `hypit result finish ${options.id}` } : {}),
          }
        : { message: options.resultReadError! },
    }),
    ...(!options.verbose ? {} : {
      operations: (options.runtime?.operations ?? options.result?.operations ?? [])
        .filter((item) => item.status !== "completed")
        .slice(0, options.operationLimit ?? 20)
        .map((item) => ({
          ...("operation" in item ? { id: item.operation } : item.id === undefined ? {} : { id: item.id }),
          ...(item.receipt === undefined ? {} : { receipt: item.receipt }),
          endpoint: item.endpoint,
          state: item.status,
          ...(item.progress === undefined ? {} : { progress: item.progress }),
          ...(item.failure === undefined ? {} : { failure: {
            code: item.failure.code,
            message: item.failure.message,
          } }),
        })),
    }),
  };
}

export async function buildResultView(
  repository: BuildResultRepository,
  manifest: BuildResultManifest,
  options: { readonly projectRoot: string; readonly output?: string; readonly limit: number },
): Promise<CliBuildResultView> {
  if (options.output !== undefined && manifest.outputs[options.output] === undefined) {
    throw new Error(`Build Result ${manifest.id} has no public Output ${options.output}`);
  }
  const allNames = options.output === undefined ? orderedOutputNames(manifest) : [options.output];
  const selected = allNames.slice(0, options.limit);
  const outputs = await Promise.all(selected.map(async (name) =>
    await outputView(repository, manifest, name)));
  return {
    id: manifest.id,
    ...(manifest.title === undefined ? {} : { title: manifest.title }),
    ...(manifest.note === undefined ? {} : { note: manifest.note }),
    createdAt: buildCreatedAtIso(manifest.id),
    ...(manifest.finishedAt === undefined ? {} : { finishedAt: new Date(manifest.finishedAt).toISOString() }),
    outcome: manifest.outcome ?? "open",
    source: projectPath(manifest.source.path, options.projectRoot),
    ...(manifest.run === undefined ? {} : { run: projectPath(manifest.run.path, options.projectRoot) }),
    targetCount: manifest.targets.length,
    targets: manifest.targets.slice(0, options.limit),
    ...(manifest.targets.length <= options.limit ? {} : { omittedTargets: manifest.targets.length - options.limit }),
    outputs,
    ...(selected.length === allNames.length ? {} : { omittedOutputs: allNames.length - selected.length }),
    ...(manifest.failure === undefined ? {} : { failure: manifest.failure }),
    ...(manifest.operations === undefined ? {} : { operations: manifest.operations.slice(0, options.limit) }),
    ...((manifest.operations?.length ?? 0) <= options.limit ? {} : { omittedOperations: manifest.operations!.length - options.limit }),
  };
}

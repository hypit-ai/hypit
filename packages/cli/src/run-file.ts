import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  buildResultDirectory,
  resolveBuildResultOutput,
} from "@hypit/build-result";
import type {
  BuildResultFileRef,
  BuildResultJsonValue,
  ResolvedBuildResultOutput,
} from "@hypit/build-result";
import {
  NodeRunCompiler,
} from "@hypit/compiler-node";
import type {
  NodeCompiledRun,
  NodeCompiler,
} from "@hypit/compiler-node";
import type { CliRuntime } from "./runtime-port.js";
import type { NodePackageContribution } from "@hypit/package-loader-node";
import type { WorkspaceSession } from "@hypit/workspace";
import type { BlobRef, CanonicalValue, StoredValue } from "@hypit/protocol";
import {
  installRunFragmentHostFacets,
  runFrontendsFromHostFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@hypit/run";
import type { RunFrontend } from "@hypit/run";
import { selectArchivedRecord } from "./archive.js";

export type LoadedRunFile = NodeCompiledRun & {
  readonly path: string;
  readonly compiler: NodeRunCompiler;
};

export async function checkRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
}) {
  const compiler = createRunCompiler(options);
  return await compiler.checkSource(options.workspace.entry, options.workspace);
}

function createRunCompiler(options: {
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
  readonly runtime?: Pick<CliRuntime, "status">;
  readonly resultsRoot?: string;
  readonly workspace?: WorkspaceSession;
}): NodeRunCompiler {
  const fragments = new RunFragmentRegistry();
  for (const item of options.packageContributions) {
    installRunFragmentHostFacets(item.hostFacets ?? [], fragments);
  }
  const frontends = new RunFrontendRegistry();
  for (const frontend of options.frontends) frontends.register(frontend);
  const archive = new Map<string, Awaited<ReturnType<CliRuntime["status"]>>>();
  const archived = async (id: string) => {
    const existing = archive.get(id);
    if (existing !== undefined) return existing;
    const status = await options.runtime!.status(id);
    archive.set(id, status);
    return status;
  };
  const isResultFile = (value: unknown): value is BuildResultFileRef => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return false;
    const item = value as Readonly<Record<string, unknown>>;
    return item.kind === "build-file" && typeof item.path === "string"
      && typeof item.size === "number" && typeof item.mediaType === "string";
  };
  const isResultOutput = (value: unknown): value is { readonly kind: "build-output"; readonly build: string; readonly output: string } => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return false;
    const item = value as Readonly<Record<string, unknown>>;
    return item.kind === "build-output" && typeof item.build === "string" && typeof item.output === "string";
  };
  const isBlob = (value: unknown): value is BlobRef => {
    if (value === null || Array.isArray(value) || typeof value !== "object") return false;
    const item = value as Readonly<Record<string, unknown>>;
    return item.kind === "blob" && typeof item.digest === "string"
      && typeof item.size === "number" && typeof item.mediaType === "string";
  };
  const resultValue = async (
    value: BuildResultJsonValue,
    owner: string,
  ): Promise<CanonicalValue | BlobRef> => {
    const workspace = options.workspace;
    const resultsRoot = options.resultsRoot;
    if (workspace === undefined || resultsRoot === undefined) {
      throw new Error("Build Result resolution has no Workspace");
    }
    const admit = async (file: BuildResultFileRef, defaultBuild: string): Promise<BlobRef> => {
      const build = file.build ?? defaultBuild;
      const directory = buildResultDirectory(resultsRoot, build);
      if (isAbsolute(file.path)) throw new Error(`Build ${build} file path must be relative`);
      const absolute = resolve(directory, file.path);
      const relation = relative(directory, absolute);
      if (relation === ".." || relation.startsWith(`..${sep}`)) {
        throw new Error(`Build ${build} file path leaves its result directory`);
      }
      const sourceRelative = relative(dirname(workspace.entry.id), absolute);
      const from = sourceRelative.startsWith(".") ? sourceRelative : `.${sep}${sourceRelative}`;
      const admitted = await workspace.resolveAsset(workspace.entry, { from, mediaType: file.mediaType });
      return {
        ...admitted.artifact,
        origin: { kind: "build-file", build, path: file.path },
      };
    };
    if (isResultFile(value)) return await admit(value, owner);
    if (isResultOutput(value)) {
        const forwarded = await resolveBuildResultOutput(resultsRoot, value.build, value.output);
        if (forwarded === undefined) throw new Error(`Build ${value.build} has no Output ${value.output}`);
        return await resolvedValue(forwarded);
    }
    if (Array.isArray(value)) {
      return await Promise.all(value.map(async (item) => await resultValue(item, owner))) as CanonicalValue;
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(await Promise.all(Object.entries(value)
        .map(async ([key, item]) => [key, await resultValue(item, owner)] as const))) as CanonicalValue;
    }
    return value;
  };
  const resolvedValue = async (resolved: ResolvedBuildResultOutput): Promise<BlobRef | CanonicalValue> => {
    if (resolved.value.kind === "build-file") return await resultValue(resolved.value, resolved.build);
    if (resolved.value.kind === "inline") return resolved.value.value;
    return await resultValue(resolved.value.value, resolved.build);
  };
  const storedResult = async (build: string, output: string): Promise<{
    readonly type: ResolvedBuildResultOutput["type"];
    readonly value: StoredValue;
  } | undefined> => {
    const resultsRoot = options.resultsRoot;
    if (resultsRoot === undefined) return undefined;
    const resolved = await resolveBuildResultOutput(resultsRoot, build, output);
    if (resolved === undefined) return undefined;
    const value = await resolvedValue(resolved);
    return {
      type: resolved.type,
      value: isBlob(value) ? value : { kind: "inline", value },
    };
  };
  return new NodeRunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.resultsRoot !== undefined ? {
      async resolveBuildRecord(id: string, output: string) {
        return await storedResult(id, output);
      },
    } : options.runtime === undefined ? {} : {
      async resolveBuildRecord(id: string, output: string) {
        const status = await archived(id);
        if (status.build === undefined) return undefined;
        const catalog = status.catalog;
        const alias = catalog?.aliases.find((item) => item.name === output);
        if (alias !== undefined && alias.ref.kind !== "logical-output") {
          throw new Error(`Build ${id} alias ${output} is an authored Record, not a Logical Output`);
        }
        const record = alias === undefined
          ? selectArchivedRecord(status.build.state, { output })
          : selectArchivedRecord(status.build.state, {
              name: output,
              catalog: catalog as NonNullable<typeof catalog>,
            });
        return { type: record.type, value: record.value };
      },
    }),
  });
}

export function collectRunFrontends(
  packages: readonly NodePackageContribution[],
): readonly RunFrontend[] {
  return packages.flatMap((item) => runFrontendsFromHostFacets(item.hostFacets ?? []));
}

export async function loadRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
  readonly runtime?: Pick<CliRuntime, "status">;
  readonly resultsRoot?: string;
}): Promise<LoadedRunFile> {
  const compiler = createRunCompiler({ ...options, workspace: options.workspace });
  const compiled = await compiler.compileSource(options.workspace.entry, options.workspace);
  return { path: options.workspace.entry.id, compiler, ...compiled };
}

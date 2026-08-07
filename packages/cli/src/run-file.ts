import {
  NodeRunCompiler,
} from "@svml/compiler-node";
import type {
  NodeCompiledRun,
  NodeCompiler,
} from "@svml/compiler-node";
import type { LocalRuntime } from "@svml/local";
import type { NodePackageContribution } from "@svml/package-loader-node";
import type { WorkspaceSession } from "@svml/host";
import {
  installRunFragmentHostFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@svml/run";
import type { RunFrontend } from "@svml/run";

export type LoadedRunFile = NodeCompiledRun & {
  readonly path: string;
  readonly compiler: NodeRunCompiler;
};

export function collectRunFrontends(
  builtIns: readonly RunFrontend[],
  packages: readonly NodePackageContribution[],
): readonly RunFrontend[] {
  return [
    ...builtIns,
    ...packages.flatMap((item) => item.runFrontends ?? []),
  ];
}

export async function loadRunFile(options: {
  readonly workspace: WorkspaceSession;
  readonly authorCompiler: NodeCompiler;
  readonly frontends: readonly RunFrontend[];
  readonly packageContributions: readonly NodePackageContribution[];
  readonly runtime?: Pick<LocalRuntime, "status">;
}): Promise<LoadedRunFile> {
  const fragments = new RunFragmentRegistry();
  for (const item of options.packageContributions) {
    installRunFragmentHostFacets(item.hostFacets ?? [], fragments);
  }
  const frontends = new RunFrontendRegistry();
  for (const frontend of options.frontends) frontends.register(frontend);
  const archive = new Map<string, Awaited<ReturnType<LocalRuntime["status"]>>>();
  const archived = async (id: string) => {
    const existing = archive.get(id);
    if (existing !== undefined) return existing;
    const status = await options.runtime!.status(id);
    archive.set(id, status);
    return status;
  };
  const compiler = new NodeRunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.runtime === undefined ? {} : {
      async readBuild(id: string) {
        return (await archived(id)).build?.state;
      },
      async resolveBuildOutput(id: string, output: string) {
        const alias = (await archived(id)).catalog?.aliases.find((item) => item.name === output);
        if (alias === undefined) return output;
        if (alias.ref.kind !== "logical-output") {
          throw new Error(`Build ${id} alias ${output} is an authored Record, not a Logical Output`);
        }
        return alias.ref.id;
      },
    }),
  });
  const compiled = await compiler.compileSource(options.workspace.entry, options.workspace);
  return { path: options.workspace.entry.id, compiler, ...compiled };
}

import {
  NodeRunCompiler,
} from "@narratage/compiler-node";
import type {
  NodeCompiledRun,
  NodeCompiler,
} from "@narratage/compiler-node";
import type { LocalRuntime } from "@narratage/local";
import type { NodePackageContribution } from "@narratage/package-loader-node";
import type { WorkspaceSession } from "@narratage/host";
import {
  installRunFragmentHostFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@narratage/run";
import type { RunFrontend } from "@narratage/run";

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
  readonly runtime?: Pick<LocalRuntime, "status">;
}): NodeRunCompiler {
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
  return new NodeRunCompiler({
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
}

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
  const compiler = createRunCompiler(options);
  const compiled = await compiler.compileSource(options.workspace.entry, options.workspace);
  return { path: options.workspace.entry.id, compiler, ...compiled };
}

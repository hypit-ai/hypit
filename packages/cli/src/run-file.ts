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
  const compiler = new NodeRunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.runtime === undefined ? {} : {
      async readBuild(id: string) {
        return (await options.runtime!.status(id)).build?.state;
      },
    }),
  });
  const compiled = await compiler.compileSource(options.workspace.entry, options.workspace);
  return { path: options.workspace.entry.id, compiler, ...compiled };
}

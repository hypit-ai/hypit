import {
  NodeRunCompiler,
} from "@narratage/compiler-node";
import type {
  NodeCompiledRun,
  NodeCompiler,
} from "@narratage/compiler-node";
import type { CliRuntime } from "./runtime-port.js";
import type { NodePackageContribution } from "@narratage/package-loader-node";
import type { WorkspaceSession } from "@narratage/workspace";
import {
  installRunFragmentHostFacets,
  runFrontendsFromHostFacets,
  RunFragmentRegistry,
  RunFrontendRegistry,
} from "@narratage/run";
import type { RunFrontend } from "@narratage/run";
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
  return new NodeRunCompiler({
    authorCompiler: options.authorCompiler,
    frontends,
    fragments,
    ...(options.runtime === undefined ? {} : {
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
}): Promise<LoadedRunFile> {
  const compiler = createRunCompiler(options);
  const compiled = await compiler.compileSource(options.workspace.entry, options.workspace);
  return { path: options.workspace.entry.id, compiler, ...compiled };
}

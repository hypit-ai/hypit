import type { CliCompilerOptions } from "@hypit/cli";
import { createMarkupNodeCompiler } from "@hypit/compiler-markup-node";
import { resolveNodePackageSource } from "@hypit/package-loader-node";
import { NodeFilesystemWorkspace } from "@hypit/workspace-fs-node";

export function createVideoWorkspace(options: Pick<CliCompilerOptions,
  "workspaceRoot" | "assetRoots" | "packageRoot" | "distributionPackageRoot">) {
  const packageRoot = options.packageRoot ?? options.workspaceRoot ?? process.cwd();
  return new NodeFilesystemWorkspace({
    ...(options.workspaceRoot === undefined ? {} : { root: options.workspaceRoot }),
    ...(options.assetRoots === undefined ? {} : { assetRoots: options.assetRoots }),
    externalSourceResolver(importer, request) {
      const located = resolveNodePackageSource(request.from, {
        from: importer.id,
        workspaceRoots: [packageRoot],
        ...(options.distributionPackageRoot === undefined
          ? {}
          : { distributionRoots: [options.distributionPackageRoot] }),
        externalRoots: [],
        allowExternal: false,
      });
      return { root: located.root, source: located.source };
    },
  });
}

/** Assemble the Markup compiler Host from only the packages selected for this invocation. */
export function createVideoCompiler(options: CliCompilerOptions) {
  return createMarkupNodeCompiler(options.packageContributions, {
    workspace: createVideoWorkspace(options),
  });
}

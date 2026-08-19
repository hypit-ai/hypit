import type { CliCompilerOptions } from "@hypit/cli";
import { createMarkupNodeCompiler } from "@hypit/compiler-markup-node";
import { NodeFilesystemWorkspace } from "@hypit/workspace-fs-node";

/** Assemble the Markup compiler Host from only the packages selected for this invocation. */
export function createVideoCompiler(options: CliCompilerOptions) {
  return createMarkupNodeCompiler(options.packageContributions, {
    workspace: new NodeFilesystemWorkspace({
      ...(options.workspaceRoot === undefined ? {} : { root: options.workspaceRoot }),
      ...(options.assetRoots === undefined ? {} : { assetRoots: options.assetRoots }),
    }),
  });
}

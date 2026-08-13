import type { CliCompilerOptions } from "@narratage/cli";
import { createMarkupNodeCompiler } from "@narratage/compiler-markup-node";
import { NodeFilesystemWorkspace } from "@narratage/workspace-fs-node";

/** Assemble the Markup compiler Host from only the packages selected for this invocation. */
export function createVideoCompiler(options: CliCompilerOptions) {
  return createMarkupNodeCompiler(options.packageContributions, {
    workspace: new NodeFilesystemWorkspace({
      ...(options.workspaceRoot === undefined ? {} : { root: options.workspaceRoot }),
      ...(options.assetRoots === undefined ? {} : { assetRoots: options.assetRoots }),
    }),
  });
}

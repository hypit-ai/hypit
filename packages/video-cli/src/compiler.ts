import type { CliCompilerOptions } from "@narratage/cli";
import { createMarkupNodeCompiler } from "@narratage/compiler-markup-node";

/** Video authoring packages are selected by an explicit package lock; none are implicit here. */
export const videoBuiltInPackageContributions = [] as const;

/** Assemble the Markup compiler Host from only the packages selected for this invocation. */
export function createVideoCompiler(options: CliCompilerOptions) {
  return createMarkupNodeCompiler(options.packageContributions, {
    ...(options.workspaceRoot === undefined ? {} : { root: options.workspaceRoot }),
  });
}

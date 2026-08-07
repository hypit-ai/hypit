import type { CliCompilerOptions } from "@narratage/cli";
import { createTextNodeCompiler } from "@narratage/compiler-text-node";

/** Video authoring packages are selected by an explicit package lock; none are implicit here. */
export const videoBuiltInPackageContributions = [] as const;

/** Assemble the Text compiler Host from only the packages selected for this invocation. */
export function createVideoCompiler(options: CliCompilerOptions) {
  return createTextNodeCompiler(options.packageContributions, {
    ...(options.root === undefined ? {} : { root: options.root }),
  });
}

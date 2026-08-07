import type { CliCompilerOptions } from "@svml/cli";
import { createTextNodeCompiler } from "@svml/compiler-text-node";
import { svmlPackage as videoPrelude } from "@svml/prelude-video";

export const videoBuiltInPackageContributions = [videoPrelude] as const;

/** Video Distribution chooses Text authoring and one ordinary replaceable video Prelude. */
export function createVideoCompiler(options: CliCompilerOptions) {
  return createTextNodeCompiler(options.packageContributions, {
    ...(options.root === undefined ? {} : { root: options.root }),
  });
}

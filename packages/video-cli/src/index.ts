import {
  materializeArtifact,
  materializeRecord,
  runCli,
} from "@narratage/cli";
import type { NodePackageContribution } from "@narratage/package-loader-node";

import { videoCliDistribution } from "./distribution.js";

export { materializeArtifact, materializeRecord };
export {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";
export {
  createVideoRuntimeFromConfig,
} from "./runtime-config.js";
export { videoCliDistribution } from "./distribution.js";

export function runVideoCli(
  argv: readonly string[],
  io: { readonly write: (text: string) => void },
  packageContributions: readonly NodePackageContribution[] = [],
): Promise<void> {
  return runCli(argv, io, {
    ...videoCliDistribution,
    builtInPackageContributions: packageContributions,
  });
}

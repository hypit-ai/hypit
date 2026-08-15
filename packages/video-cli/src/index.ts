import {
  materializeArtifact,
  materializeRecord,
  runCli,
} from "@narratage/cli";
import type { CliIo } from "@narratage/cli";
import type { NodePackageBinding } from "@narratage/package-loader-node";

import { videoCliDistribution } from "./distribution.js";

export { materializeArtifact, materializeRecord };
export {
  createVideoCompiler,
} from "./compiler.js";
export { videoCliDistribution } from "./distribution.js";

export function runVideoCli(
  argv: readonly string[],
  io: CliIo,
  packages: readonly NodePackageBinding[] = [],
): Promise<void> {
  return runCli(argv, io, {
    ...videoCliDistribution,
    bootstrapPackages: packages,
  });
}

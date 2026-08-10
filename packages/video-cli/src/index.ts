import {
  materializeArtifact,
  materializeRecord,
  runCli,
} from "@narratage/cli";
import type { CliIo } from "@narratage/cli";
import type { NodePackageContribution } from "@narratage/package-loader-node";

import { videoCliDistribution } from "./distribution.js";

export { materializeArtifact, materializeRecord };
export {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";
export { videoCliDistribution } from "./distribution.js";

export async function createVideoRuntimeFromConfig(path: string) {
  const implementation = await import("./runtime-config.js");
  return await implementation.createVideoRuntimeFromConfig(path);
}

export function runVideoCli(
  argv: readonly string[],
  io: CliIo,
  packageContributions: readonly NodePackageContribution[] = [],
): Promise<void> {
  return runCli(argv, io, {
    ...videoCliDistribution,
    builtInPackageContributions: packageContributions,
  });
}

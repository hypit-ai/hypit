import {
  materializeArtifact,
  materializeRecord,
  runCli,
} from "@svml/cli";

import { videoCliDistribution } from "./distribution.js";

export { materializeArtifact, materializeRecord };
export {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";
export {
  createVideoRuntimeConfigRegistry,
  createVideoRuntimeFromConfig,
} from "./runtime-config.js";
export { videoCliDistribution } from "./distribution.js";

export function runVideoCli(
  argv: readonly string[],
  io: { readonly write: (text: string) => void },
): Promise<void> {
  return runCli(argv, io, videoCliDistribution);
}

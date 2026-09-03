import { runCli } from "@hypit/cli";
import type { CliIo } from "@hypit/cli";
import {
  installDistributionPackageResolution,
  installExternalPackageResolution,
} from "@hypit/package-loader-node";
import { hypitHostPackageRoot } from "@hypit/runtime-host-node";
import type { LoadedPackage } from "@hypit/package-loader-node";

import { isCreationCommand, runCreationCli } from "./creation.js";
import { videoCliDistribution } from "./distribution.js";

export {
  createVideoCompiler,
} from "./compiler.js";
export { videoCliDistribution } from "./distribution.js";
export { discoverVideoSourcePackages } from "./package-selection.js";
export { creationCommands, isCreationCommand, runCreationCli, writeCreationHelp } from "./creation.js";
export type { CreationCommand, CreationEnvironment, CreationHost } from "./creation.js";
/** The project's selected Runtime Profile, read the way `hypit` reads it, for tools that run beside the CLI. */
export { findRuntimeProfile } from "@hypit/cli";

export function runVideoCli(
  argv: readonly string[],
  io: CliIo,
  packages: readonly LoadedPackage[] = [],
): Promise<void> {
  installDistributionPackageResolution(videoCliDistribution.packageRoot === undefined
    ? []
    : [videoCliDistribution.packageRoot]);
  installExternalPackageResolution([hypitHostPackageRoot()]);
  if (isCreationCommand(argv[0])) return runCreationCli(argv, io);
  return runCli(argv, io, {
    ...videoCliDistribution,
    bootstrapPackages: packages,
  });
}

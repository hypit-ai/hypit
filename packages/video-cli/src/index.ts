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
import { runMediaCli } from "./media.js";
import { runVocabularyCli } from "./vocabulary.js";
import { runCaptureCli } from "./capture.js";

export {
  createVideoCompiler,
  createVideoWorkspace,
} from "./compiler.js";
export { videoCliDistribution } from "./distribution.js";
export { videoStudioCompanionPackages } from "./studio-distribution.js";
export { discoverVideoSourcePackages } from "./package-selection.js";
export { creationCommands, isCreationCommand, runCreationCli, writeCreationHelp } from "./creation.js";
export type { CreationCommand, CreationEnvironment, CreationHost } from "./creation.js";
export { isMediaCommand, mediaCommands, runMediaCli, writeMediaHelp } from "./media.js";
export type { MediaCommand, MediaProbe } from "./media.js";
export { runCaptureCli, writeCaptureHelp } from "./capture.js";
export { listPackages, listSurfaces, runVocabularyCli, visualSchema, writeVocabularyHelp } from "./vocabulary.js";
export type { PackageListing, SurfaceListing } from "./vocabulary.js";
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
  if (argv[0] === "media") return runMediaCli(argv, io);
  if (argv[0] === "capture") return runCaptureCli(argv, io);
  if (argv[0] === "vocabulary") return runVocabularyCli(argv, io);
  return runCli(argv, io, {
    ...videoCliDistribution,
    bootstrapPackages: packages,
  });
}

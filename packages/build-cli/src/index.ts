import type { CliCommandModule } from "@hypit/cli";

import { runBuildOperationsCli, runSourceBuildCli } from "./main.js";
import type {
  BuildOperationsCliServices,
  SourceBuildCliServices,
} from "./services.js";
import {
  writeBuildOperationsCliRootHelp,
  writeCliHelp,
  writeSourceBuildCliRootHelp,
} from "./output.js";

export const sourceBuildCliCommandNames = [
  "check",
  "plan",
  "pricing",
  "build",
] as const;

export const buildOperationsCliCommandNames = [
  "builds",
  "history",
  "inspect",
  "logs",
  "status",
  "activity",
  "cancel",
  "result",
  "auth",
  "doctor",
] as const;

/** Bind Source compilation without claiming accepted-Build operational commands. */
export function createSourceBuildCliCommandModules(
  services: SourceBuildCliServices,
): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/build-cli/source",
    commands: sourceBuildCliCommandNames,
    writeRootHelp: writeSourceBuildCliRootHelp,
    writeHelp(argv, io) {
      const topic = argv[0] === "help" ? argv[1] : argv[0];
      writeCliHelp(io, topic);
    },
    async run(argv, io, context) {
      await runSourceBuildCli(argv, io, services, context);
    },
  }];
}

/** Bind accepted-Build, Result and Runtime operations without compiler services. */
export function createBuildOperationsCliCommandModules(
  services: BuildOperationsCliServices,
): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/build-cli/operations",
    commands: buildOperationsCliCommandNames,
    writeRootHelp: writeBuildOperationsCliRootHelp,
    writeHelp(argv, io) {
      const topic = argv[0] === "help" ? argv[1] : argv[0];
      writeCliHelp(io, topic);
    },
    async run(argv, io, context) {
      await runBuildOperationsCli(argv, io, services, context);
    },
  }];
}

export { runBuildOperationsCli, runSourceBuildCli } from "./main.js";
export { discoverSourcePackages } from "./source-discovery.js";
export { loadDiscoveredSourcePackages } from "./source-packages.js";
export type {
  BuildCliCompilerOptions,
  BuildCliContextServices,
  BuildCliServices,
  BuildOperationsCliServices,
  SourceBuildCliServices,
} from "./services.js";
export type * from "./runtime-port.js";
export type {
  CliBuildResultView,
  CliBuildStatusView,
  CliBuildSummary,
  CliOutputView,
  PublicOutputRepresentation,
} from "./view.js";

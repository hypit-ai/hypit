import type { CliCommandModule } from "@hypit/cli";

import { runCli } from "./main.js";
import type { BuildCliServices } from "./services.js";
import { writeBuildCliRootHelp, writeCliHelp } from "./output.js";

export const buildCliCommandNames = [
  "check",
  "plan",
  "pricing",
  "build",
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

/** Bind long-compilation commands to one exact application service assembly. */
export function createBuildCliCommandModules(
  services: BuildCliServices,
): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/build-cli",
    commands: buildCliCommandNames,
    writeRootHelp: writeBuildCliRootHelp,
    writeHelp(argv, io) {
      const topic = argv[0] === "help" ? argv[1] : argv[0];
      writeCliHelp(io, topic);
    },
    async run(argv, io, context) {
      await runCli(argv, io, services, context);
    },
  }];
}

export { runCli } from "./main.js";
export { discoverSourcePackages } from "./source-discovery.js";
export { loadDiscoveredSourcePackages } from "./source-packages.js";
export type { BuildCliCompilerOptions, BuildCliServices } from "./services.js";
export type * from "./runtime-port.js";
export type {
  CliBuildResultView,
  CliBuildStatusView,
  CliBuildSummary,
  CliOutputView,
  PublicOutputRepresentation,
} from "./view.js";

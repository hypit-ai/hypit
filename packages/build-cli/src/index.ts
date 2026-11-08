import type { CliCommandModule } from "@hypit/cli";
import { writeCliHelp, writeSourceBuildCliRootHelp } from "@hypit/build-operations-cli";

import { runSourceBuildCli } from "./main.js";
import type { SourceBuildCliServices } from "./services.js";

export const sourceBuildCliCommandNames = ["check", "plan", "pricing", "build"] as const;

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

export { runSourceBuildCli } from "./main.js";
export { discoverSourcePackages } from "./source-discovery.js";
export { loadDiscoveredSourcePackages } from "./source-packages.js";
export type { BuildCliCompilerOptions, BuildCliServices, SourceBuildCliServices } from "./services.js";

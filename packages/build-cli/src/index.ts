import {
  runCli,
  writeBuildCliRootHelp,
  writeCliHelp,
} from "@hypit/cli";
import type {
  CliCommandModule,
  CliDistribution,
} from "@hypit/cli";

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
  distribution: CliDistribution,
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
      await runCli(argv, io, distribution, context);
    },
  }];
}

import type { CliCommandModule } from "@hypit/cli";
import {
  isMediaCommand,
  mediaCommands,
  runMediaCli,
  writeMediaHelp,
} from "@hypit/media-file-local";

/** Direct local media-file tools; no Runtime or Build is opened. */
export function createLocalMediaCliCommandModules(): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/media-local-cli",
    commands: ["media"],
    writeRootHelp(io) {
      io.write(`\nLocal media\n  media ${mediaCommands.join(" | ")}\n  hypit media --help for exact options\n`);
    },
    writeHelp(argv, io) {
      const subcommand = argv[0] === "help" ? argv[2] : argv[1];
      writeMediaHelp(io, isMediaCommand(subcommand) ? subcommand : undefined);
    },
    async run(argv, io, context) {
      await runMediaCli(argv, io, context.cwd);
    },
  }];
}

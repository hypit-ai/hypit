import type { CliCommandModule } from "@hypit/cli/public";
import {
  isMediaCommand,
  mediaCommands,
  runMediaCli,
  writeMediaHelp,
} from "./index.js";

/** Direct local media-file tools; no Runtime or Build is opened. */
export function createLocalMediaCliCommandModules(): readonly CliCommandModule[] {
  return [{
    id: "@hypit/media-file-local#cli",
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

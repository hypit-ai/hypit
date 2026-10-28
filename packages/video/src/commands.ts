import type { CliCommandModule } from "@hypit/hypit/cli";

import { runVocabularyCli, writeVocabularyHelp } from "./vocabulary.js";

/** The Video application owns only its installed author-vocabulary view. */
export const cliCommandModules = [{
  format: "hypit.cli-command@1",
  id: "@hypit/video",
  commands: ["vocabulary"],
  writeRootHelp(io) {
    io.write("\nVideo author vocabulary\n  vocabulary\n  hypit vocabulary --help for package and declaration inspection\n");
  },
  writeHelp(_argv, io) {
    writeVocabularyHelp(io);
  },
  async run(argv, io, context) {
    await runVocabularyCli(argv, io, context.cwd, context.distribution.packageRoot);
  },
}] as const satisfies readonly CliCommandModule[];

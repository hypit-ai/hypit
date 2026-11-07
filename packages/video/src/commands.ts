import type { CliCommandModule } from "@hypit/hypit/cli";

import { runVocabularyCli, writeVocabularyHelp } from "./vocabulary.js";
import { runNleCli, writeNleHelp } from "./nle-cli.js";

/** Application-owned views and direct NLE file tasks selected by the Video Distribution. */
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
}, {
  format: "hypit.cli-command@1",
  id: "@hypit/video:nle",
  commands: ["nle"],
  writeRootHelp(io) {
    io.write("\nLocal HTML-effects NLE\n  nle export\n  hypit nle --help for exact options\n");
  },
  writeHelp(_argv, io) {
    writeNleHelp(io);
  },
  async run(argv, io, context) {
    await runNleCli(argv, io, context.cwd, context.distribution.packageRoot);
  },
}] as const satisfies readonly CliCommandModule[];

import type { CliCommandModule } from "@hypit/cli";

import { runSvmlVocabularyCli, writeVocabularyHelp } from "./vocabulary.js";

/** Author vocabulary view selected by the Toolchain Distribution. */
export function createSvmlToolchainCliCommandModules(options: {
  readonly distributionPackageRoot?: string;
} = {}): readonly CliCommandModule[] {
  return [{
    format: "hypit.cli-command@1",
    id: "@hypit/toolchain",
    commands: ["vocabulary"],
    writeRootHelp(io) {
      io.write("\nAuthor vocabulary\n  vocabulary\n  hypit vocabulary --help for package and declaration inspection\n");
    },
    writeHelp(_argv, io) {
      writeVocabularyHelp(io);
    },
    async run(argv, io, context) {
      await runSvmlVocabularyCli(argv, io, context.cwd, options.distributionPackageRoot);
    },
  }];
}

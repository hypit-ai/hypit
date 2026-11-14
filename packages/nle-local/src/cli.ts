import type { CliCommandModule } from "@hypit/cli/public";

import { runNleCli, writeNleHelp } from "./cli-command.js";

/** Direct local NLE file tasks; no Runtime or Build is opened. */
export function createLocalNleCliCommandModules(options: {
  readonly distributionPackageRoot?: string;
} = {}): readonly CliCommandModule[] {
  return [{
    id: "@hypit/nle-local#cli",
    commands: ["nle"],
    writeRootHelp(io) {
      io.write("\nLocal component-driven NLE\n  nle export | frames | review\n  hypit nle --help for exact options\n");
    },
    writeHelp(_argv, io) {
      writeNleHelp(io);
    },
    async run(argv, io, context) {
      await runNleCli(argv, io, context.cwd, await context.resolveProjectRoot(), options.distributionPackageRoot);
    },
  }];
}

export { runNleCli, writeNleHelp } from "./cli-command.js";

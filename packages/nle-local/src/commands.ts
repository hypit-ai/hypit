import type { CliCommandModule } from "@hypit/hypit/cli";

import { runNleCli, writeNleHelp } from "./cli.js";

/** Direct local NLE file tasks; no Runtime or Build is opened. */
export const cliCommandModules = [{
  format: "hypit.cli-command@1",
  id: "@hypit/nle-local",
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

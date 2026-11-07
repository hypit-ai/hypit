import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { CliDistribution } from "../../src/distribution.js";
import { runCli as runBuildCli } from "../../src/main.js";
import type { CliIo } from "../../src/output.js";

export const applicationCwd = tmpdir();

export const runCli = async (argv: readonly string[], output: CliIo, selected: CliDistribution) => await runBuildCli(
  argv,
  output,
  selected,
  {
    cwd: applicationCwd,
    resolveProjectRoot: async (explicit) => await realpath(explicit ?? tmpdir()),
  },
);

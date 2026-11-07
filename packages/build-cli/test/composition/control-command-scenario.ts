import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { BuildCliServices } from "../../src/services.js";
import { runCli as runBuildCli } from "../../src/main.js";
import type { CliIo } from "@hypit/cli";

export const applicationCwd = tmpdir();

export const runCli = async (argv: readonly string[], output: CliIo, selected: BuildCliServices) => await runBuildCli(
  argv,
  output,
  selected,
  {
    cwd: applicationCwd,
    resolveProjectRoot: async (explicit) => await realpath(explicit ?? tmpdir()),
  },
);

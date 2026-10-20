import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";

import type { CliDistribution } from "../../src/distribution.js";
import { runCliApplication } from "../../src/application.js";
import type { CliIo } from "../../src/output.js";
import { createLocalRuntimeCliCommandModules } from "../../../runtime-local/src/cli.js";
import type { LocalRuntimeHost } from "../../../runtime-local/src/host-api.js";

export const applicationCwd = tmpdir();

export const runCli = async (argv: readonly string[], output: CliIo, selected: CliDistribution) => await runCliApplication(
  argv,
  output,
  {
    // The real video application assembles both generic and Local Runtime Host
    // ports. These focused doubles do the same when mounting Local commands.
    distribution: selected,
    commandModules: createLocalRuntimeCliCommandModules({
      ...(selected.packageRoot === undefined ? {} : { packageRoot: selected.packageRoot }),
      openLocalRuntimeHost: async (path, options) =>
        await selected.openRuntimeHost(path, options) as LocalRuntimeHost,
    }),
    cwd: applicationCwd,
    resolveProjectRoot: async (explicit) => await realpath(explicit ?? tmpdir()),
  },
);

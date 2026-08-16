import type { CliDistribution } from "@narratage/cli";
import { openLocalRuntimeHost } from "@narratage/runtime-local";
import { fileURLToPath } from "node:url";
import {
  createVideoCompiler,
} from "./compiler.js";

const packageRoot = import.meta.dirname;
const installedLauncher = process.env.NARRATAGE_CLI_LAUNCHER;

/** Official video authoring assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  packageRoot,
  bootstrapPackages: [],
  createCompiler: createVideoCompiler,
  discoverSourcePackages: async (path, options) => {
    const { discoverVideoSourcePackages } = await import("./package-selection.js");
    return await discoverVideoSourcePackages(path, options);
  },
  openRuntimeHost: async (path, options) => await openLocalRuntimeHost(path, {
    packageRoot: options.packageRoot,
    workerLaunch: {
      command: process.execPath,
      // The repository launcher registers TypeScript support before entering the CLI.
      // Tests that import this Distribution directly keep the current Node arguments.
      args: installedLauncher === undefined
        ? [
            ...process.execArgv.filter((item) => !item.startsWith("--test")),
            fileURLToPath(new URL("./cli.ts", import.meta.url)),
          ]
        : [installedLauncher],
    },
  }),
};

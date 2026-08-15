import type { CliDistribution } from "@narratage/cli";
import { loadNodeRuntimeHost } from "@narratage/runtime-host-node";
import { fileURLToPath } from "node:url";
import {
  createVideoCompiler,
} from "./compiler.js";

const fallbackPackageRoot = import.meta.dirname;
const installedLauncher = process.env.NARRATAGE_CLI_LAUNCHER;

/** Official video authoring assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  fallbackPackageRoot,
  bootstrapPackages: [],
  createCompiler: createVideoCompiler,
  discoverSourcePackages: async (path, options) => {
    const { discoverVideoSourcePackages } = await import("./package-selection.js");
    return await discoverVideoSourcePackages(path, options);
  },
  openRuntimeHost: async (path, options) => await loadNodeRuntimeHost(path, {
    packageRoot: options.packageRoot,
    workerLaunch: {
      command: process.execPath,
      // The installed cross-platform bin is self-bootstrapping. Tests and direct
      // source imports retain the explicit TypeScript loader fallback.
      args: installedLauncher === undefined
        ? [
            ...process.execArgv.filter((item) => !item.startsWith("--test")),
            fileURLToPath(new URL("./cli.ts", import.meta.url)),
          ]
        : [installedLauncher],
    },
  }),
};

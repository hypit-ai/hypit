import type { CliDistribution } from "@hypit/cli";
import { openLocalRuntimeHost } from "@hypit/runtime-local";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createVideoCompiler,
} from "./compiler.js";

// The Distribution root is the replaceable Hypit tool checkout, not this
// package's source directory and never the author's project.
const packageRoot = resolve(import.meta.dirname, "../../..");
const installedLauncher = process.env.HYPIT_CLI_LAUNCHER;

/** Official video authoring assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  packageRoot,
  bootstrapPackages: [],
  createCompiler: createVideoCompiler,
  discoverSourcePackages: async (path, options) => {
    const { discoverVideoSourcePackages } = await import("./package-selection.js");
    return await discoverVideoSourcePackages(path, options);
  },
  generatePicture: async (request) => {
    const { generateVideoCliPicture } = await import("./picture.js");
    return await generateVideoCliPicture(request);
  },
  openRuntimeHost: async (path, options) => await openLocalRuntimeHost(path, {
    packageRoot: options.packageRoot,
    ...(options.distributionPackageRoot === undefined
      ? {}
      : { distributionPackageRoot: options.distributionPackageRoot }),
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

import type { CliDistribution } from "@hypit/cli";
import { openLocalRuntimeHost } from "@hypit/runtime-local";
import { fileURLToPath } from "node:url";
import {
  createVideoCompiler,
} from "./compiler.js";

const packageRoot = import.meta.dirname;
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

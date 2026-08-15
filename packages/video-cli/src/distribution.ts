import type { CliDistribution } from "@narratage/cli";
import { loadNodeRuntimeHost } from "@narratage/runtime-adapter-node";
import { fileURLToPath } from "node:url";
import {
  createVideoCompiler,
} from "./compiler.js";

const packageRoot = import.meta.dirname;

/** Official video authoring assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  packageRoot,
  bootstrapPackages: [],
  createCompiler: createVideoCompiler,
  discoverSourcePackages: async (path, options) => {
    const { discoverVideoSourcePackages } = await import("./package-selection.js");
    return await discoverVideoSourcePackages(path, options);
  },
  openRuntimeHost: async (path) => await loadNodeRuntimeHost(path, {
    packageRoot,
    workerLaunch: {
      command: process.execPath,
      // A test runner's --test flags must never leak into the detached CLI.
      args: [
        ...process.execArgv.filter((item) => !item.startsWith("--test")),
        fileURLToPath(new URL("./cli.ts", import.meta.url)),
      ],
    },
  }),
};

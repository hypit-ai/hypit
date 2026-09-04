import type { CliDistribution } from "@hypit/cli";
import {
  doctorProjectBuildResultRepository,
  openLocalRuntimeHost,
  openProjectBuildResultRepository,
} from "@hypit/runtime-local";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createVideoCompiler,
} from "./compiler.js";

// The Distribution root is the replaceable Hypit tool checkout, not this
// package's source directory and never the author's project.
const packageRoot = resolve(process.env.HYPIT_DISTRIBUTION_ROOT ?? resolve(import.meta.dirname, "../../.."));
const installedLauncher = process.env.HYPIT_CLI_LAUNCHER;

/** Official video authoring assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  packageRoot,
  bootstrapPackages: [],
  initialRuntimeProfile: {
    format: "hypit.runtime-local@1",
    dataRoot: ".hypit/runtimes/local",
    credentials: {
      os: { use: "@hypit/credential-store-os" },
    },
    endpoints: {
      "hypihub.default": {
        use: "@hypit/provider-hypihub",
        config: {
          baseUrl: "https://hypit.ai",
          apiKey: { store: "os", key: "hypihub.oauth" },
        },
      },
      "media.local": {
        use: "@hypit/provider-media-local",
      },
      "hyperframes.local": {
        use: "@hypit/provider-hyperframes-local",
      },
    },
  },
  createCompiler: createVideoCompiler,
  discoverSourcePackages: async (path, options) => {
    const { discoverVideoSourcePackages } = await import("./package-selection.js");
    return await discoverVideoSourcePackages(path, options);
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
  openProjectResults: async (projectRoot, options) => {
    const opened = await openProjectBuildResultRepository(projectRoot, options);
    return {
      location: opened.location,
      repository: opened.repository,
      close: async () => await opened.close?.(),
    };
  },
  diagnoseProjectResults: async (projectRoot, options) =>
    await doctorProjectBuildResultRepository(projectRoot, options),
};

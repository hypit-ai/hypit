import type { CliDistribution } from "@hypit/hypit/cli";
import {
  doctorProjectBuildResultRepository,
  findRuntimeProfile,
  openLocalRuntimeHost,
  openProjectBuildResultRepository,
} from "@hypit/runtime-local";
import type { LocalRuntimeCliDistribution } from "@hypit/runtime-local/cli";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createVideoCompiler,
  createVideoWorkspace,
} from "./compiler.js";

// The Distribution root is the replaceable Hypit tool checkout, not this
// package's source directory and never the author's project.
export type VideoDistributionOptions = {
  /** Physical root of the installed Hypit video Distribution. */
  readonly packageRoot?: string;
  /** Exact executable the Local Runtime Worker must re-enter. */
  readonly launcher?: string;
};

/** Assemble the official video application once at its executable composition root. */
export function createVideoDistribution(options: VideoDistributionOptions = {}): CliDistribution & LocalRuntimeCliDistribution {
  const packageRoot = resolve(options.packageRoot ?? resolve(import.meta.dirname, "../../.."));
  const launcher = options.launcher ?? fileURLToPath(new URL("../../../bin/hypit.mjs", import.meta.url));
  const openVideoLocalRuntime = async (path: string, runtimeOptions: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
  }) => await openLocalRuntimeHost(path, {
    packageRoot: runtimeOptions.packageRoot,
    ...(runtimeOptions.distributionPackageRoot === undefined
      ? {}
      : { distributionPackageRoot: runtimeOptions.distributionPackageRoot }),
    workerLaunch: {
      command: process.execPath,
      args: [launcher],
    },
  });
  return {
    packageRoot,
    bootstrapPackages: [],
    initialRuntimeProfile: {
      format: "hypit.runtime-local@1",
      dataRoot: ".hypit/runtimes/local",
      // The starter selects the portable Store, so the Profile it writes is openable and writable on
      // Linux as well: macOS and Windows keep the platform locker, and a Linux host uses an
      // owner-private file. An explicit file backend remains available inside the same local Store.
      credentials: {
        local: { use: "@hypit/credential-store-local" },
      },
      endpoints: {
        "hypihub.default": {
          use: "@hypit/provider-hypihub",
          config: {
            baseUrl: "https://hypit.ai",
            apiKey: { store: "local", key: "hypihub.oauth" },
          },
        },
        "media.local": {
          use: "@hypit/media-local",
        },
        "html.local": {
          use: "@hypit/provider-html-local",
        },
        "image.opencv.local": {
          use: "@hypit/provider-image-opencv-local",
        },
      },
    },
    createWorkspace: createVideoWorkspace,
    resolveProjectRuntime: async (projectRoot) => {
      const selected = await findRuntimeProfile(projectRoot);
      return selected === undefined ? undefined : { profile: selected.profile };
    },
    createCompiler: createVideoCompiler,
    discoverSourcePackages: async (path, options) => {
      const { discoverVideoSourcePackages } = await import("./package-selection.js");
      return await discoverVideoSourcePackages(path, options);
    },
    openLocalRuntimeHost: openVideoLocalRuntime,
    openRuntimeHost: openVideoLocalRuntime,
    openProjectResults: async (projectRoot) => {
      const opened = await openProjectBuildResultRepository(projectRoot);
      return {
        location: opened.location,
        repository: opened.repository,
        close() {},
      };
    },
    diagnoseProjectResults: async (projectRoot) => await doctorProjectBuildResultRepository(projectRoot),
  };
}

import type { CliDistribution } from "@narratage/cli";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";
import {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";

const packageRoot = import.meta.dirname;

/** Official video authoring and local Runtime-adapter assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  name: "@narratage/video-cli",
  packageRoot,
  builtInPackageContributions: videoBuiltInPackageContributions,
  runFrontends: [],
  createCompiler: createVideoCompiler,
  resolveCompilationPackages: async (path) => {
    if (extname(path) !== ".json") return {};
    const { runtimeConfigPackageSelection } = await import("@narratage/local/config");
    const selection = await runtimeConfigPackageSelection(path, { packageRoot });
    return {
      ...(selection.packageLock === undefined ? {} : { packageLock: selection.packageLock }),
      packageRoot: selection.packageRoot,
    };
  },
  runtimeWorkerLaunch: () => ({
    command: process.execPath,
    args: [...process.execArgv, fileURLToPath(new URL("./cli.ts", import.meta.url))],
  }),
  createRuntimeFromConfig: async (path, options) => {
    const { createVideoRuntimeFromConfig } = await import("./runtime-config.js");
    return await createVideoRuntimeFromConfig(path, packageRoot, options?.implementationPackages);
  },
  createRuntimeControlFromConfig: async (path) => {
    const { createRuntimeControlFromConfig } = await import("@narratage/local/config");
    return await createRuntimeControlFromConfig(path, { packageRoot });
  },
  createRuntimeCredentialsFromConfig: async (path, endpoint) => {
    const { createRuntimeCredentialsFromConfig } = await import("@narratage/local/config");
    return await createRuntimeCredentialsFromConfig(path, endpoint, { packageRoot });
  },
  doctorRuntimeConfig: async (path) => {
    const { doctorRuntimeConfig } = await import("@narratage/local/config");
    return await doctorRuntimeConfig(path, { packageRoot });
  },
  externalServices: {
    up: async (path, options) => {
      const { bringExternalServicesUp } = await import("@narratage/local/external-services");
      return await bringExternalServicesUp(path, { ...options, packageRoot });
    },
    down: async (path) => {
      const { takeExternalServicesDown } = await import("@narratage/local/external-services");
      return await takeExternalServicesDown(path, { packageRoot });
    },
    report: async (path) => {
      const { reportExternalServices } = await import("@narratage/local/external-services");
      return await reportExternalServices(path, { packageRoot });
    },
  },
};

import type { CliDistribution } from "@narratage/cli";
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
  createRuntimeFromConfig: async (path) => {
    const { createVideoRuntimeFromConfig } = await import("./runtime-config.js");
    return await createVideoRuntimeFromConfig(path);
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

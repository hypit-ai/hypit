import type { CliDistribution } from "@narratage/cli";
import {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";
import {
  bringExternalServicesUp,
  doctorRuntimeConfig,
  reportExternalServices,
  takeExternalServicesDown,
} from "@narratage/local";
import { createVideoRuntimeFromConfig } from "./runtime-config.js";

const packageRoot = import.meta.dirname;

/** Official video authoring and local Runtime-adapter assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  name: "@narratage/video-cli",
  packageRoot,
  builtInPackageContributions: videoBuiltInPackageContributions,
  runFrontends: [],
  createCompiler: createVideoCompiler,
  createRuntimeFromConfig: createVideoRuntimeFromConfig,
  doctorRuntimeConfig: async (path) => await doctorRuntimeConfig(path, { packageRoot }),
  externalServices: {
    up: async (path, options) => await bringExternalServicesUp(path, { ...options, packageRoot }),
    down: async (path) => await takeExternalServicesDown(path, { packageRoot }),
    report: async (path) => await reportExternalServices(path, { packageRoot }),
  },
};

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

/** Official video authoring and local Runtime-adapter assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  name: "@narratage/video-cli",
  builtInPackageContributions: videoBuiltInPackageContributions,
  runFrontends: [],
  createCompiler: createVideoCompiler,
  createRuntimeFromConfig: createVideoRuntimeFromConfig,
  doctorRuntimeConfig,
  externalServices: {
    up: bringExternalServicesUp,
    down: takeExternalServicesDown,
    report: reportExternalServices,
  },
};

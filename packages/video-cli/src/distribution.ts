import type { CliDistribution } from "@svml/cli";
import {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";
import { doctorRuntimeConfig } from "@svml/local";
import { createVideoRuntimeFromConfig } from "./runtime-config.js";

/** Official video authoring and local Runtime-adapter assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  name: "@svml/video-cli",
  builtInPackageContributions: videoBuiltInPackageContributions,
  runFrontends: [],
  createCompiler: createVideoCompiler,
  createRuntimeFromConfig: createVideoRuntimeFromConfig,
  doctorRuntimeConfig,
};

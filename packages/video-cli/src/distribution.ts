import type { CliDistribution } from "@svml/cli";

import {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";
import { createVideoRuntimeFromConfig } from "./runtime-config.js";

/** Official video authoring and local Runtime-adapter assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  name: "@svml/video-cli",
  builtInPackageContributions: videoBuiltInPackageContributions,
  createCompiler: createVideoCompiler,
  createRuntimeFromConfig: createVideoRuntimeFromConfig,
};

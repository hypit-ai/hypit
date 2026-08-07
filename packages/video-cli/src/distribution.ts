import type { CliDistribution } from "@svml/cli";
import { runTextFrontend } from "@svml/run-text";

import {
  createVideoCompiler,
  videoBuiltInPackageContributions,
} from "./compiler.js";
import { createVideoRuntimeFromConfig } from "./runtime-config.js";

/** Official video authoring and local Runtime-adapter assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  name: "@svml/video-cli",
  builtInPackageContributions: videoBuiltInPackageContributions,
  runFrontends: [runTextFrontend],
  createCompiler: createVideoCompiler,
  createRuntimeFromConfig: createVideoRuntimeFromConfig,
};

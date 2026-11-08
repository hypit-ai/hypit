import type { SourceBuildCliServices } from "@hypit/build-cli";
import {
  createToolchainApplicationServices,
  type ToolchainApplicationOptions,
} from "@hypit/toolchain";

import {
  createSvmlToolchainCompiler,
  createSvmlToolchainWorkspace,
} from "./compiler.js";
import { discoverSvmlSourcePackages } from "./package-selection.js";

/** Optional SVML/Source application assembled over the distribution's shared Build services. */
export function createSvmlToolchainApplicationServices(
  options: ToolchainApplicationOptions = {},
): SourceBuildCliServices {
  const common = createToolchainApplicationServices(options).buildOperations;
  return {
    ...(common.packageRoot === undefined ? {} : { packageRoot: common.packageRoot }),
    bootstrapPackages: [],
    createWorkspace: createSvmlToolchainWorkspace,
    createCompiler: createSvmlToolchainCompiler,
    discoverSourcePackages: async (path, discoverOptions) =>
      await discoverSvmlSourcePackages(path, discoverOptions),
    ...(common.resolveProjectRuntime === undefined
      ? {}
      : { resolveProjectRuntime: common.resolveProjectRuntime }),
    openRuntimeHost: common.openRuntimeHost,
    openProjectResults: common.openProjectResults,
  };
}

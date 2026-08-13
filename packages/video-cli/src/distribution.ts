import type { CliDistribution } from "@narratage/cli";
import { fileURLToPath } from "node:url";
import {
  createVideoCompiler,
} from "./compiler.js";

const packageRoot = import.meta.dirname;

/** Official video authoring and local Runtime-adapter assembly for the generic CLI engine. */
export const videoCliDistribution: CliDistribution = {
  packageRoot,
  bootstrapPackages: [],
  createCompiler: createVideoCompiler,
  discoverSourcePackages: async (path, options) => {
    const { discoverVideoSourcePackages } = await import("./package-selection.js");
    return await discoverVideoSourcePackages(path, options);
  },
  resolveCompilationPackages: async (path) => {
    const { runtimeConfigPackageSelection } = await import("@narratage/local/config");
    const selection = await runtimeConfigPackageSelection(path, { packageRoot });
    return {
      root: selection.root,
      ...(selection.packageLock === undefined ? {} : { packageLock: selection.packageLock }),
      ...(selection.runtimePackageLock === undefined ? {} : { runtimePackageLock: selection.runtimePackageLock }),
      packageRoot: selection.packageRoot,
      runtimeSelection: selection.runtimeSelection,
    };
  },
  runtimeProfileRevision: async (path) => {
    const { runtimeConfigRevision } = await import("@narratage/local/config");
    return await runtimeConfigRevision(path);
  },
  runtimeWorkerLaunch: () => ({
    command: process.execPath,
    args: [...process.execArgv, fileURLToPath(new URL("./cli.ts", import.meta.url))],
  }),
  createRuntimeFromConfig: async (path, options) => {
    const { createVideoRuntimeFromConfig } = await import("./runtime-config.js");
    return await createVideoRuntimeFromConfig(path, packageRoot, options?.implementationPackages);
  },
  createRuntimeControlFromConfig: async (path, options) => {
    const { createRuntimeControlFromConfig } = await import("@narratage/local/config");
    return await createRuntimeControlFromConfig(path, {
      packageRoot,
      ...(options?.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    });
  },
  createRuntimeCredentialsFromConfig: async (path, endpoint) => {
    const { createRuntimeCredentialsFromConfig } = await import("@narratage/local/config");
    return await createRuntimeCredentialsFromConfig(path, endpoint, { packageRoot });
  },
  doctorRuntimeConfig: async (path, options) => {
    const { doctorRuntimeConfig } = await import("@narratage/local/config");
    return await doctorRuntimeConfig(path, { packageRoot, ...options });
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

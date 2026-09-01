import type {
  NodeRuntimeHost,
  RuntimeController,
  RuntimeWorkerLaunch,
} from "@hypit/runtime-host-node";
import { hypitHostStateRoot } from "@hypit/runtime-host-node";
import { resolve } from "node:path";

import {
  createRuntimeArchiveFromConfig,
  createRuntimeResourceAccessFromConfig,
  createRuntimeCredentialsFromConfig,
  createRuntimeFromConfig,
  doctorRuntimeConfig,
  openBuildResultRepositoryFromConfig,
  prepareRuntimeConfigPackages,
  preflightRuntimeConfig,
  resolveRuntimeConfigPaths,
} from "./config.js";
import {
  bringManagedProgramsUp,
  reportManagedPrograms,
  takeManagedProgramsDown,
} from "./programs.js";
import {
  ensureRuntimeProcess,
  markRuntimeProcessReady,
  runtimeProcessLogs,
  runtimeProcessStatus,
  stopRuntimeProcess,
} from "./worker-process.js";

export async function openLocalRuntimeHost(
  path: string,
  hostOptions: {
    readonly packageRoot: string;
    readonly distributionPackageRoot?: string;
    readonly hostStateRoot?: string;
    readonly workerLaunch: RuntimeWorkerLaunch;
  },
): Promise<NodeRuntimeHost> {
  const profile = resolve(path);
  const basePackageRoot = resolve(hostOptions.packageRoot);
  const distribution = {
    hostStateRoot: resolve(hostOptions.hostStateRoot ?? hypitHostStateRoot()),
    ...(hostOptions.distributionPackageRoot === undefined
      ? {}
      : { distributionPackageRoot: hostOptions.distributionPackageRoot }),
  };
  const controller = async (controllerOptions: {
    readonly packageRoot?: string;
  } = {}): Promise<RuntimeController> => {
    const packageRoot = controllerOptions.packageRoot ?? basePackageRoot;
    const selection = await resolveRuntimeConfigPaths(profile, { packageRoot, ...distribution });
    return {
      profile,
      dataRoot: selection.dataRoot,
      worker: {
        up: async (workerOptions) => {
          return await ensureRuntimeProcess(
            profile,
            selection.dataRoot,
            {
              ...hostOptions.workerLaunch,
              workerArgs: [
                "--package-root", packageRoot,
              ],
            },
            workerOptions?.maxWaitMs ?? 10_000,
          );
        },
        status: async () => await runtimeProcessStatus(profile, selection.dataRoot),
        logs: async () => await runtimeProcessLogs(selection.dataRoot),
        down: async (workerOptions) => await stopRuntimeProcess(
          profile,
          selection.dataRoot,
          workerOptions?.maxWaitMs ?? 10_000,
        ),
      },
      programs: {
        up: async (programOptions) => await bringManagedProgramsUp(profile, { ...programOptions, packageRoot, ...distribution }),
        down: async () => await takeManagedProgramsDown(profile, { packageRoot, ...distribution }),
        report: async () => await reportManagedPrograms(profile, { packageRoot, ...distribution }),
      },
    };
  };
  return {
    profile,
    resolvePaths: async () => {
      const selection = await resolveRuntimeConfigPaths(profile, {
        packageRoot: basePackageRoot,
        ...(hostOptions.distributionPackageRoot === undefined
          ? {}
          : { distributionPackageRoot: hostOptions.distributionPackageRoot }),
      });
      return {
        packageRoot: selection.packageRoot,
        runtimeDataRoot: selection.dataRoot,
      };
    },
    controller,
    createRuntime: async () => await createRuntimeFromConfig(profile, { packageRoot: basePackageRoot, ...distribution }),
    openArchive: async (options) => await createRuntimeArchiveFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...(options?.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    }),
    openResources: async () => await createRuntimeResourceAccessFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    openCredentials: async (endpoint) => await createRuntimeCredentialsFromConfig(
      profile,
      endpoint,
      { packageRoot: basePackageRoot, ...distribution },
    ),
    openResults: async (defaultRoot) => {
      const opened = await openBuildResultRepositoryFromConfig(profile, defaultRoot, {
        packageRoot: basePackageRoot,
        ...distribution,
      });
      return {
        location: opened.location,
        repository: opened.repository,
        close: async () => {
          await opened.close?.();
        },
      };
    },
    prepare: async (options) => await prepareRuntimeConfigPackages(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...(options?.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    }),
    preflight: async (options) => await preflightRuntimeConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...(options?.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    }),
    doctor: async (options) => await doctorRuntimeConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...(options?.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    }),
    runWorker: async (readyFile) => {
      const runtime = await createRuntimeFromConfig(profile, { packageRoot: basePackageRoot, ...distribution });
      const abort = new AbortController();
      const stop = (): void => abort.abort();
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      try {
        await markRuntimeProcessReady(readyFile);
        await runtime.work({
          idlePollMs: 250,
          signal: abort.signal,
        });
      } finally {
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
        await runtime.close();
      }
    },
  };
}

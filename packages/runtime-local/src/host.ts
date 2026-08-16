import type {
  NodeRuntimeHost,
  RuntimeController,
  RuntimeWorkerLaunch,
} from "@narratage/runtime-host-node";
import { resolve } from "node:path";

import {
  createRuntimeArchiveFromConfig,
  createRuntimeArtifactAccessFromConfig,
  createRuntimeCredentialsFromConfig,
  createRuntimeFromConfig,
  createRuntimeMaintenanceFromConfig,
  doctorRuntimeConfig,
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
  hostOptions: { readonly packageRoot: string; readonly workerLaunch: RuntimeWorkerLaunch },
): Promise<NodeRuntimeHost> {
  const profile = resolve(path);
  const basePackageRoot = resolve(hostOptions.packageRoot);
  const controller = async (controllerOptions: {
    readonly packageRoot?: string;
  } = {}): Promise<RuntimeController> => {
    const packageRoot = controllerOptions.packageRoot ?? basePackageRoot;
    const selection = await resolveRuntimeConfigPaths(profile, { packageRoot });
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
        up: async (programOptions) => await bringManagedProgramsUp(profile, { ...programOptions, packageRoot }),
        down: async () => await takeManagedProgramsDown(profile, { packageRoot }),
        report: async () => await reportManagedPrograms(profile, { packageRoot }),
      },
    };
  };
  return {
    profile,
    resolvePaths: async () => {
      const selection = await resolveRuntimeConfigPaths(profile, { packageRoot: basePackageRoot });
      return {
        packageRoot: selection.packageRoot,
        runtimeDataRoot: selection.dataRoot,
      };
    },
    controller,
    createRuntime: async () => await createRuntimeFromConfig(profile, { packageRoot: basePackageRoot }),
    openArchive: async (options) => await createRuntimeArchiveFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...(options?.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    }),
    openArtifacts: async (options) => await createRuntimeArtifactAccessFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...(options?.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    }),
    openMaintenance: async (options) => await createRuntimeMaintenanceFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...(options?.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    }),
    openCredentials: async (endpoint) => await createRuntimeCredentialsFromConfig(
      profile,
      endpoint,
      { packageRoot: basePackageRoot },
    ),
    doctor: async (options) => await doctorRuntimeConfig(profile, {
      packageRoot: basePackageRoot,
      ...(options?.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    }),
    runWorker: async (readyFile) => {
      const runtime = await createRuntimeFromConfig(profile, { packageRoot: basePackageRoot });
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

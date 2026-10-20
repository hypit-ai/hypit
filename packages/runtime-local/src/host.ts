import type {
  LocalRuntimeHost,
  RuntimeController,
  RuntimeWorkerLaunch,
} from "./host-api.js";
import { hypitHostStateRoot } from "@hypit/hypit/cli";
import { resolve } from "node:path";
import { superviseBuilds } from "./supervisor.js";

import {
  createRuntimeControlFromConfig,
  createRuntimeResultControlFromConfig,
  createRuntimeCredentialsFromConfig,
  createRuntimeFromConfig,
  describeRuntimeConfigEndpoints,
  doctorRuntimeConfig,
  invokeRuntimeConfigNeed,
  openRuntimeConfigInspection,
  openTransientRuntimeConfigExecution,
  preflightRuntimeConfig,
  readRuntimeConfigPricing,
  resolveRuntimeConfigPaths,
} from "./config.js";
import {
  bringManagedProgramsUp,
  prepareManagedPrograms,
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
): Promise<LocalRuntimeHost> {
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
        prepare: async (programOptions) => await prepareManagedPrograms(profile, { ...programOptions, packageRoot, ...distribution }),
        up: async (programOptions) => await bringManagedProgramsUp(profile, { ...programOptions, packageRoot, ...distribution }),
        down: async (scope) => await takeManagedProgramsDown(profile, { ...scope, packageRoot, ...distribution }),
        report: async (scope) => await reportManagedPrograms(profile, { ...scope, packageRoot, ...distribution }),
      },
    };
  };
  return {
    profile,
    executionStatus: async () => {
      const selected = await controller();
      return await selected.worker.status();
    },
    ensureExecution: async (options) => {
      const selected = await controller();
      return await selected.worker.up(options);
    },
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
    createRuntime: async (scope) => await createRuntimeFromConfig(profile, { packageRoot: basePackageRoot, ...distribution, ...scope }),
    openControl: async (options) => await createRuntimeControlFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...(options?.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    }),
    openResultControl: async () => await createRuntimeResultControlFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    openCredentials: async (endpoint) => await createRuntimeCredentialsFromConfig(
      profile,
      endpoint,
      { packageRoot: basePackageRoot, ...distribution },
    ),
    preflight: async (options) => await preflightRuntimeConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...(options?.capabilities === undefined ? {} : { capabilities: options.capabilities }),
      ...(options?.endpoints === undefined ? {} : { endpoints: options.endpoints }),
    }),
    doctor: async (options) => await doctorRuntimeConfig(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...(options?.capabilities === undefined ? {} : { capabilities: options.capabilities }),
      ...(options?.endpoints === undefined ? {} : { endpoints: options.endpoints }),
    }),
    openInspection: async (requests) => {
      const inspection = await openRuntimeConfigInspection(profile, requests, {
        packageRoot: basePackageRoot,
        ...distribution,
      });
      return {
        ...inspection,
        executionStatus: async () => await runtimeProcessStatus(profile, inspection.dataRoot),
        ensureExecution: async (options) => await ensureRuntimeProcess(
          profile,
          inspection.dataRoot,
          {
            ...hostOptions.workerLaunch,
            workerArgs: ["--package-root", basePackageRoot],
          },
          options?.maxWaitMs ?? 10_000,
        ),
      };
    },
    endpoints: async (queries) => await describeRuntimeConfigEndpoints(profile, queries, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    pricing: async (requests) => await readRuntimeConfigPricing(profile, requests, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    invoke: async (need, resources, observation) => await invokeRuntimeConfigNeed(profile, need, resources, {
      packageRoot: basePackageRoot,
      ...distribution,
      ...observation,
    }),
    openTransientExecution: async () => await openTransientRuntimeConfigExecution(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    runWorker: async (readyFile, owner, execution) => {
      const abort = new AbortController();
      const stop = (): void => { abort.abort(); };
      // A Build never survives loss of its supervisor by silently changing code owners.
      const disconnected = (): never => process.exit(1);
      const message = (value: unknown): void => {
        if (typeof value === "object" && value !== null && "kind" in value && value.kind === "stop-execution") stop();
      };
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      if (execution !== undefined) {
        process.once("disconnect", disconnected);
        process.on("message", message);
      }
      try {
        if (execution !== undefined) {
          const { executeBuilds } = await import("./executor.js");
          await executeBuilds(execution.dataRoot, abort.signal);
        } else {
          const paths = await resolveRuntimeConfigPaths(profile, { packageRoot: basePackageRoot, ...distribution });
          await superviseBuilds({
            profile, dataRoot: paths.dataRoot, readyFile, owner,
            launch: {
              ...hostOptions.workerLaunch,
              workerArgs: ["--package-root", basePackageRoot],
            },
            signal: abort.signal,
            ready: async () => await markRuntimeProcessReady(readyFile, owner),
          });
        }
      } catch (error) {
        if (execution !== undefined && process.connected) process.send?.({ kind: "execution-error", message: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally {
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
        process.removeListener("disconnect", disconnected);
        process.removeListener("message", message);
        if (execution !== undefined && process.connected) process.disconnect();
      }
    },
  };
}

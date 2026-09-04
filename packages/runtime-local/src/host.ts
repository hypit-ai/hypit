import type {
  NodeRuntimeHost,
  RuntimeController,
  RuntimeWorkerLaunch,
} from "@hypit/runtime-host-node";
import { hypitHostStateRoot } from "@hypit/runtime-host-node";
import { join, resolve } from "node:path";
import { SqliteRuntimeState } from "@hypit/store-sqlite";

import {
  createRuntimeControlFromConfig,
  createRuntimeResultControlFromConfig,
  createRuntimeCredentialsFromConfig,
  createRuntimeFromConfig,
  describeRuntimeConfigProviders,
  doctorRuntimeConfig,
  invokeRuntimeConfigNeed,
  openTransientRuntimeConfigExecution,
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
  runtimeProcessOwnsCurrentProfile,
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
    providers: async (capabilities) => await describeRuntimeConfigProviders(profile, capabilities, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    invoke: async (need, resources) => await invokeRuntimeConfigNeed(profile, need, resources, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    openTransientExecution: async () => await openTransientRuntimeConfigExecution(profile, {
      packageRoot: basePackageRoot,
      ...distribution,
    }),
    runWorker: async (readyFile, owner) => {
      const selected = await resolveRuntimeConfigPaths(profile, { packageRoot: basePackageRoot, ...distribution });
      const leaseState = new SqliteRuntimeState(join(selected.dataRoot, "runtime.sqlite"));
      const leaseMs = 30_000;
      const acquiredAt = Date.now();
      const acquired = await leaseState.workerLease.acquire({
        owner,
        pid: process.pid,
        acquiredAt,
        expiresAt: acquiredAt + leaseMs,
      });
      if (!acquired) {
        leaseState.close();
        throw new Error("another Runtime Worker owns this Runtime");
      }
      let runtime: Awaited<ReturnType<typeof createRuntimeFromConfig>> | undefined;
      const abort = new AbortController();
      const stop = (): void => abort.abort();
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      let renewal = Promise.resolve();
      const heartbeat = setInterval(() => {
        renewal = renewal.then(async () => {
          if (!await runtimeProcessOwnsCurrentProfile(profile, selected.dataRoot, owner)) {
            abort.abort(new Error("Runtime Profile changed; this Worker stopped before using mixed configuration"));
            return;
          }
          const renewed = await leaseState.workerLease.renew(owner, process.pid, Date.now() + leaseMs);
          if (!renewed) abort.abort(new Error("Runtime Worker ownership was lost"));
        }).catch((error: unknown) => abort.abort(error));
      }, 5_000);
      try {
        const assertExecutionOwner = async (): Promise<void> => {
          const lease = await leaseState.workerLease.read();
          if (lease?.owner !== owner || lease.pid !== process.pid || lease.expiresAt <= Date.now()) {
            throw new Error("Runtime Worker no longer owns this Runtime");
          }
        };
        runtime = await createRuntimeFromConfig(profile, {
          packageRoot: basePackageRoot,
          ...distribution,
          assertExecutionOwner,
        });
        await runtime.work({
          idlePollMs: 250,
          signal: abort.signal,
          ready: async () => {
            await assertExecutionOwner();
            if (!await runtimeProcessOwnsCurrentProfile(profile, selected.dataRoot, owner)) {
              throw new Error("Runtime Profile changed while the Worker was starting");
            }
            await markRuntimeProcessReady(readyFile, owner);
          },
        });
      } finally {
        clearInterval(heartbeat);
        await renewal.catch(() => undefined);
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
        await runtime?.close();
        await leaseState.workerLease.release(owner, process.pid).catch(() => undefined);
        leaseState.close();
      }
    },
  };
}

import { digestOf } from "@narratage/protocol";
import { readNodePackageLock } from "@narratage/package-loader-node";
import {
  createNodeRuntimeHostAdapterFacet,
} from "@narratage/runtime-adapter-node";
import type {
  NodeRuntimeHost,
  NodeRuntimeHostAdapterContext,
  RuntimeController,
} from "@narratage/runtime-adapter-node";

import {
  createRuntimeArchiveFromConfig,
  createRuntimeArtifactAccessFromConfig,
  createRuntimeCredentialsFromConfig,
  createRuntimeFromConfig,
  createRuntimeMaintenanceFromConfig,
  doctorRuntimeConfig,
  runtimeConfigPackageSelection,
  runtimeConfigRevision,
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

async function createLocalRuntimeHost(context: NodeRuntimeHostAdapterContext): Promise<NodeRuntimeHost> {
  const profile = context.profile;
  const basePackageRoot = context.packageRoot;
  const controller = async (options: {
    readonly workspaceRoot?: string;
    readonly packageLock?: string;
    readonly packageRoot?: string;
  } = {}): Promise<RuntimeController> => {
    const packageRoot = options.packageRoot ?? basePackageRoot;
    const selection = await runtimeConfigPackageSelection(profile, { packageRoot });
    const revision = async (): Promise<string> => {
      const source = options.packageLock === undefined
        ? undefined
        : (await readNodePackageLock(options.packageLock)).digest;
      return digestOf({
        format: "narratage.runtime-worker-revision@1",
        profile: await runtimeConfigRevision(profile),
        source,
      });
    };
    const launch = {
      ...context.workerLaunch,
      workerArgs: [
        ...(options.workspaceRoot === undefined ? [] : ["--workspace", options.workspaceRoot]),
        ...(options.packageLock === undefined ? [] : ["--package-lock", options.packageLock]),
        "--package-root", packageRoot,
      ],
    };
    return {
      profile,
      dataRoot: selection.dataRoot,
      revision,
      worker: {
        up: async (workerOptions) => await ensureRuntimeProcess(
          profile,
          selection.dataRoot,
          launch,
          await revision(),
          workerOptions?.maxWaitMs ?? 10_000,
        ),
        status: async () => await runtimeProcessStatus(profile, selection.dataRoot, await revision()),
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
    resolvePackages: async () => {
      const selection = await runtimeConfigPackageSelection(profile, { packageRoot: basePackageRoot });
      return {
        ...(selection.runtimePackageLock === undefined ? {} : { runtimePackageLock: selection.runtimePackageLock }),
        packageRoot: selection.packageRoot,
        runtimeDataRoot: selection.dataRoot,
        runtimeSelection: selection.runtimeSelection,
      };
    },
    controller,
    createRuntime: async (options) => await createRuntimeFromConfig(profile, {
      packageRoot: basePackageRoot,
      ...(options?.implementationPackages === undefined
        ? {}
        : { implementationPackages: options.implementationPackages }),
    }),
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
      ...(options?.implementationPackages === undefined
        ? {}
        : { implementationPackages: options.implementationPackages }),
    }),
    runWorker: async (readyFile, options) => {
      const runtime = await createRuntimeFromConfig(profile, {
        packageRoot: basePackageRoot,
        ...(options?.implementationPackages === undefined
          ? {}
          : { implementationPackages: options.implementationPackages }),
      });
      const abort = new AbortController();
      const stop = (): void => abort.abort();
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop);
      try {
        await markRuntimeProcessReady(readyFile);
        await runtime.work({
          owner: `worker-${process.pid}`,
          leaseMs: 30_000,
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

export const localRuntimeHostAdapter = createNodeRuntimeHostAdapterFacet({
  use: "@narratage/local",
  open: createLocalRuntimeHost,
});

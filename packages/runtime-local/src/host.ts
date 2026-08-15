import { digestOf } from "@narratage/protocol";
import {
  createNodeRuntimeHostAdapterFacet,
} from "@narratage/runtime-host-node";
import type {
  NodeRuntimeHost,
  NodeRuntimeHostAdapterContext,
  RuntimeController,
} from "@narratage/runtime-host-node";

import {
  createRuntimeArchiveFromConfig,
  createRuntimeArtifactAccessFromConfig,
  createRuntimeCredentialsFromConfig,
  createRuntimeFromConfig,
  createRuntimeMaintenanceFromConfig,
  doctorRuntimeConfig,
  resolveRuntimeConfigPaths,
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
    readonly implementationPackages?: readonly string[];
    readonly packageRoot?: string;
  } = {}): Promise<RuntimeController> => {
    const packageRoot = options.packageRoot ?? basePackageRoot;
    const selection = await resolveRuntimeConfigPaths(profile, { packageRoot });
    const revision = async (): Promise<string> => digestOf({
      format: "narratage.runtime-worker-revision@1",
      profile: await runtimeConfigRevision(profile),
    });
    const implementationPackages = async (): Promise<readonly string[]> => {
      const values = new Set(options.implementationPackages ?? []);
      let archive: Awaited<ReturnType<typeof createRuntimeArchiveFromConfig>> | undefined;
      try {
        archive = await createRuntimeArchiveFromConfig(profile, { packageRoot, readOnly: true });
        const queue = await archive.queue();
        for (const dispatch of queue.dispatches) {
          if (dispatch.phase === "terminal") continue;
          for (const item of dispatch.implementationPackages) values.add(item);
        }
      } catch {
        // Before the first submission there may be no durable Runtime state to inspect.
      } finally {
        await archive?.close();
      }
      return [...values].sort();
    };
    return {
      profile,
      dataRoot: selection.dataRoot,
      revision,
      worker: {
        up: async (workerOptions) => {
          const packages = await implementationPackages();
          return await ensureRuntimeProcess(
            profile,
            selection.dataRoot,
            {
              ...context.workerLaunch,
              workerArgs: [
                ...(options.workspaceRoot === undefined ? [] : ["--workspace", options.workspaceRoot]),
                ...packages.flatMap((item) => ["--package", item]),
                "--package-root", packageRoot,
              ],
            },
            await revision(),
            workerOptions?.maxWaitMs ?? 10_000,
            packages,
          );
        },
        status: async () => await runtimeProcessStatus(
          profile,
          selection.dataRoot,
          await revision(),
          await implementationPackages(),
        ),
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
  use: "@narratage/runtime-local",
  open: createLocalRuntimeHost,
});

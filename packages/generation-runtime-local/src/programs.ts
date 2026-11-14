import {
  bringManagedProgramsUp as bringEnvironmentProgramsUp,
  prepareManagedPrograms as prepareEnvironmentPrograms,
  reportManagedPrograms as reportEnvironmentPrograms,
  takeManagedProgramsDown as takeEnvironmentProgramsDown,
} from "@hypit/execution-environment-local/programs";
import type {
  ManagedProgramOptions as EnvironmentManagedProgramOptions,
  ManagedProgramProgress,
  ManagedProgramReport,
} from "@hypit/execution-environment-local/programs";

import { resolveRuntimeConfigPaths } from "./config.js";
import type { LoadRuntimeConfigOptions } from "./config.js";

export type { ManagedProgramProgress, ManagedProgramReport };

export type ManagedProgramOptions = LoadRuntimeConfigOptions & Omit<
  EnvironmentManagedProgramOptions,
  keyof LoadRuntimeConfigOptions
>;

async function environment(path: string, options: ManagedProgramOptions) {
  const selected = await resolveRuntimeConfigPaths(path, options);
  return {
    profile: selected.environmentProfile,
    options: {
      packageRoot: selected.packageRoot,
      ...(options.distributionPackageRoot === undefined ? {} : {
        distributionPackageRoot: options.distributionPackageRoot,
      }),
      ...(options.hostStateRoot === undefined ? {} : { hostStateRoot: options.hostStateRoot }),
      ...(options.registry === undefined ? {} : { registry: options.registry }),
      ...(options.importModule === undefined ? {} : { importModule: options.importModule }),
      ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
      ...(options.endpoints === undefined ? {} : { endpoints: options.endpoints }),
      ...(options.maxWaitMs === undefined ? {} : { maxWaitMs: options.maxWaitMs }),
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    } satisfies EnvironmentManagedProgramOptions,
  };
}

export async function prepareManagedPrograms(path: string, options: ManagedProgramOptions = {}) {
  const selected = await environment(path, options);
  return await prepareEnvironmentPrograms(selected.profile, selected.options);
}

export async function bringManagedProgramsUp(path: string, options: ManagedProgramOptions = {}) {
  const selected = await environment(path, options);
  return await bringEnvironmentProgramsUp(selected.profile, selected.options);
}

export async function takeManagedProgramsDown(path: string, options: ManagedProgramOptions = {}) {
  const selected = await environment(path, options);
  return await takeEnvironmentProgramsDown(selected.profile, selected.options);
}

export async function reportManagedPrograms(path: string, options: ManagedProgramOptions = {}) {
  const selected = await environment(path, options);
  return await reportEnvironmentPrograms(selected.profile, selected.options);
}

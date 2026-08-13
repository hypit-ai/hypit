import {
  assembleRuntimeServices,
  verifyRuntimeServicePackage,
} from "@narratage/runtime";
import type {
  BuildCatalog,
  RuntimeServiceAssembly,
  RuntimeServicePackage,
  RuntimeServiceSelection,
} from "@narratage/runtime";

import type { ProjectLocalRuntimeControlOptions } from "./types.js";

export type ProjectRuntimeServiceSelection = RuntimeServiceSelection;
export type ProjectRuntimeServiceAssembly = RuntimeServiceAssembly;

export type AssembledProjectRuntimeServices = {
  readonly assembly: ProjectRuntimeServiceAssembly;
  readonly catalog: BuildCatalog | undefined;
  readonly selection: ProjectRuntimeServiceSelection;
  close(): Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function selectedBuildCatalog(
  packages: readonly RuntimeServicePackage[],
  buildStore: string,
): BuildCatalog | undefined {
  const owner = packages.find((item) => item.services.some((service) =>
    service.role === "build-store" && service.instance.id === buildStore));
  if (owner === undefined) return undefined;
  const catalog = owner.buildCatalog;
  if (catalog === undefined) return undefined;
  assert(catalog !== null && typeof catalog === "object"
    && "record" in catalog && typeof catalog.record === "function"
    && "read" in catalog && typeof catalog.read === "function"
    && "list" in catalog && typeof catalog.list === "function",
  `Runtime service ${buildStore} exposes an invalid Build Catalog`);
  return catalog as BuildCatalog;
}

/**
 * Assemble only the services named by the Runtime Profile. This layer never manufactures a
 * Scheduler, Worker, Store, path or credential source on the project's behalf.
 */
export async function createProjectRuntimeServices(
  _root: string,
  options: ProjectLocalRuntimeControlOptions,
): Promise<AssembledProjectRuntimeServices> {
  const packages = [...options.runtimeServices];
  try {
    for (const item of packages) verifyRuntimeServicePackage(item);
    const assembly = assembleRuntimeServices(packages, options.runtimeSelection);
    const catalog = selectedBuildCatalog(packages, options.runtimeSelection.stores.build);
    return {
      assembly,
      catalog,
      selection: options.runtimeSelection,
      close: () => assembly.close(),
    };
  } catch (error) {
    for (const item of [...packages].reverse()) await item.close?.();
    throw error;
  }
}

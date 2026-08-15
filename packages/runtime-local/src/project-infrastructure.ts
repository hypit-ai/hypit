import {
  assembleRuntimeInfrastructure,
  verifyRuntimeInfrastructurePackage,
} from "@narratage/runtime";
import type {
  BuildCatalog,
  RuntimeInfrastructureAssembly,
  RuntimeInfrastructurePackage,
  RuntimePartReference,
  RuntimeRoleSelection,
} from "@narratage/runtime";

import type { ProjectLocalRuntimeControlOptions } from "./types.js";

export type ProjectRuntimeRoles = RuntimeRoleSelection;
export type ProjectRuntimeInfrastructureAssembly = RuntimeInfrastructureAssembly;

export type AssembledProjectRuntimeInfrastructure = {
  readonly assembly: ProjectRuntimeInfrastructureAssembly;
  readonly catalog: BuildCatalog | undefined;
  readonly selection: ProjectRuntimeRoles;
  close(): Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function selectedBuildCatalog(
  packages: readonly RuntimeInfrastructurePackage[],
  buildStore: RuntimePartReference,
): BuildCatalog | undefined {
  const owner = packages.find((item) => item.parts.some((part) =>
    part.role === "build-store"
      && part.owner === buildStore.from
      && part.part === buildStore.part));
  if (owner === undefined) return undefined;
  const catalog = owner.buildCatalog;
  if (catalog === undefined) return undefined;
  assert(catalog !== null && typeof catalog === "object"
    && "record" in catalog && typeof catalog.record === "function"
    && "read" in catalog && typeof catalog.read === "function"
    && "list" in catalog && typeof catalog.list === "function",
  `Runtime part ${buildStore.from}.${buildStore.part} exposes an invalid Build Catalog`);
  return catalog as BuildCatalog;
}

/**
 * Assemble only the infrastructure parts named by the Runtime Profile. This layer never manufactures a
 * Scheduler, Worker, Store, path or credential source on the project's behalf.
 */
export async function createProjectRuntimeInfrastructure(
  _root: string,
  options: ProjectLocalRuntimeControlOptions,
): Promise<AssembledProjectRuntimeInfrastructure> {
  const packages = [...options.infrastructure];
  try {
    for (const item of packages) verifyRuntimeInfrastructurePackage(item);
    const assembly = assembleRuntimeInfrastructure(packages, options.roles);
    const catalog = selectedBuildCatalog(packages, options.roles.buildStore);
    return {
      assembly,
      catalog,
      selection: options.roles,
      close: () => assembly.close(),
    };
  } catch (error) {
    for (const item of [...packages].reverse()) await item.close?.();
    throw error;
  }
}

import {
  assembleRuntimeComponents,
  verifyRuntimeComponentPackage,
} from "@narratage/runtime";
import type {
  BuildCatalog,
  RuntimeComponentAssembly,
  RuntimeComponentPackage,
  RuntimeBindings,
} from "@narratage/runtime";

import type { ProjectLocalRuntimeControlOptions } from "./types.js";

export type ProjectRuntimeBindings = RuntimeBindings;
export type ProjectRuntimeComponentAssembly = RuntimeComponentAssembly;

export type AssembledProjectRuntimeComponents = {
  readonly assembly: ProjectRuntimeComponentAssembly;
  readonly catalog: BuildCatalog | undefined;
  readonly selection: ProjectRuntimeBindings;
  close(): Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function selectedBuildCatalog(
  packages: readonly RuntimeComponentPackage[],
  buildStore: string,
): BuildCatalog | undefined {
  const owner = packages.find((item) => item.components.some((component) =>
    component.role === "build-store" && component.instance.id === buildStore));
  if (owner === undefined) return undefined;
  const catalog = owner.buildCatalog;
  if (catalog === undefined) return undefined;
  assert(catalog !== null && typeof catalog === "object"
    && "record" in catalog && typeof catalog.record === "function"
    && "read" in catalog && typeof catalog.read === "function"
    && "list" in catalog && typeof catalog.list === "function",
  `Runtime Component ${buildStore} exposes an invalid Build Catalog`);
  return catalog as BuildCatalog;
}

/**
 * Assemble only the Components named by the Runtime Profile. This layer never manufactures a
 * Scheduler, Worker, Store, path or credential source on the project's behalf.
 */
export async function createProjectRuntimeComponents(
  _root: string,
  options: ProjectLocalRuntimeControlOptions,
): Promise<AssembledProjectRuntimeComponents> {
  const packages = [...options.runtimeComponents];
  try {
    for (const item of packages) verifyRuntimeComponentPackage(item);
    const assembly = assembleRuntimeComponents(packages, options.bindings);
    const catalog = selectedBuildCatalog(packages, options.bindings.stores.build);
    return {
      assembly,
      catalog,
      selection: options.bindings,
      close: () => assembly.close(),
    };
  } catch (error) {
    for (const item of [...packages].reverse()) await item.close?.();
    throw error;
  }
}

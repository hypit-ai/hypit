import { resolve } from "node:path";

import { createFileArtifactStorePackage } from "@svml/artifact-store-fs";
import { createEnvironmentCredentialStorePackage } from "@svml/credential-store-env";
import {
  assembleRuntimeServices,
  verifyRuntimeServicePackage,
} from "@svml/runtime";
import type {
  ArtifactStore,
  BuildStore,
  CredentialStore,
  OperationStore,
  RuntimeServiceAssembly,
  RuntimeServiceFacetRole,
  RuntimeServicePackage,
} from "@svml/runtime";
import { createSqliteRuntimeServicePackage } from "@svml/store-sqlite";

import { createLocalSchedulerPackage } from "./scheduler-package.js";
import type { ProjectLocalRuntimeOptions } from "./types.js";

export type ProjectRuntimeServiceSelection = {
  readonly scheduler: string;
  readonly stores: {
    readonly build: string;
    readonly operations: string;
    readonly artifacts: string;
    readonly credentials: string;
  };
};

export type ProjectRuntimeServiceAssembly = RuntimeServiceAssembly & {
  readonly buildStore: BuildStore;
  readonly operationStore: OperationStore;
  readonly artifactStore: ArtifactStore;
  readonly credentialStore: CredentialStore;
};

export type AssembledProjectRuntimeServices = {
  readonly assembly: ProjectRuntimeServiceAssembly;
  readonly selection: ProjectRuntimeServiceSelection;
  readonly allowedPermissions: readonly string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function configuredServiceIds(
  packages: readonly RuntimeServicePackage[],
  role: RuntimeServiceFacetRole,
): readonly string[] {
  return packages.flatMap((item) => item.services
    .filter((service) => service.role === role)
    .map((service) => service.instance.id));
}

function chooseService(
  packages: readonly RuntimeServicePackage[],
  role: RuntimeServiceFacetRole,
  explicit: string | undefined,
  fallback: string,
): string {
  const configured = configuredServiceIds(packages, role);
  if (explicit !== undefined) return explicit;
  if (configured.length === 0) return fallback;
  if (configured.length === 1) return configured[0]!;
  throw new Error(`multiple ${role} services are configured; runtimeSelection must choose one`);
}

function hasConfiguredService(
  packages: readonly RuntimeServicePackage[],
  id: string,
): boolean {
  return packages.some((item) => item.services.some((service) => service.instance.id === id));
}

function manifestPermissions(packages: readonly RuntimeServicePackage[]): readonly string[] {
  return [...new Set(packages.flatMap((item) => item.manifest.facets.flatMap((facet) => facet.permissions)))];
}

async function closeServicePackages(packages: readonly RuntimeServicePackage[]): Promise<void> {
  const closed = new Set<RuntimeServicePackage>();
  for (const item of [...packages].reverse()) {
    if (closed.has(item)) continue;
    closed.add(item);
    await item.close?.();
  }
}

async function closeAfterFailure(
  packages: readonly RuntimeServicePackage[],
  error: unknown,
): Promise<never> {
  try {
    await closeServicePackages(packages);
  } catch (closeError) {
    throw new AggregateError([error, closeError], "Runtime service assembly and cleanup both failed");
  }
  throw error;
}

function projectSelection(
  packages: readonly RuntimeServicePackage[],
  options: ProjectLocalRuntimeOptions,
): ProjectRuntimeServiceSelection {
  return {
    scheduler: chooseService(
      packages,
      "scheduler",
      options.runtimeSelection?.scheduler,
      "scheduler.local",
    ),
    stores: {
      build: chooseService(
        packages,
        "build-store",
        options.runtimeSelection?.stores?.build,
        "builds.sqlite",
      ),
      operations: chooseService(
        packages,
        "operation-store",
        options.runtimeSelection?.stores?.operations,
        "operations.sqlite",
      ),
      artifacts: chooseService(
        packages,
        "artifact-store",
        options.runtimeSelection?.stores?.artifacts,
        "artifacts.fs",
      ),
      credentials: chooseService(
        packages,
        "credential-store",
        options.runtimeSelection?.stores?.credentials,
        "credentials.env",
      ),
    },
  };
}

/** Local-distribution defaults and exact service selection, separate from Build execution. */
export async function createProjectRuntimeServices(
  root: string,
  options: ProjectLocalRuntimeOptions,
): Promise<AssembledProjectRuntimeServices> {
  const configured = [...(options.runtimeServices ?? [])];
  let selection: ProjectRuntimeServiceSelection;
  try {
    for (const item of configured) verifyRuntimeServicePackage(item);
    selection = projectSelection(configured, options);
  } catch (error) {
    return await closeAfterFailure(configured, error);
  }

  const defaults: RuntimeServicePackage[] = [];
  try {
    if (!hasConfiguredService(configured, selection.scheduler)) {
      assert(selection.scheduler === "scheduler.local", `unknown selected scheduler ${selection.scheduler}`);
      defaults.push(createLocalSchedulerPackage(selection.scheduler));
    }
    const needsDefaultBuild = !hasConfiguredService(configured, selection.stores.build);
    const needsDefaultOperations = !hasConfiguredService(configured, selection.stores.operations);
    if (needsDefaultBuild || needsDefaultOperations) {
      assert((!needsDefaultBuild || selection.stores.build === "builds.sqlite")
        && (!needsDefaultOperations || selection.stores.operations === "operations.sqlite"),
      "unknown selected BuildStore or OperationStore");
      defaults.push(createSqliteRuntimeServicePackage({
        path: resolve(root, options.statePath ?? ".svml/runtime.sqlite"),
        buildInstance: "builds.sqlite",
        operationInstance: "operations.sqlite",
      }));
    } else if (options.statePath !== undefined) {
      throw new Error("statePath configures the default SQLite services, but neither was selected");
    }
    if (!hasConfiguredService(configured, selection.stores.artifacts)) {
      assert(selection.stores.artifacts === "artifacts.fs",
        `unknown selected ArtifactStore ${selection.stores.artifacts}`);
      defaults.push(createFileArtifactStorePackage({
        root: resolve(root, options.artifactPath ?? ".svml/artifacts"),
        instance: selection.stores.artifacts,
      }));
    } else if (options.artifactPath !== undefined) {
      throw new Error("artifactPath configures the default filesystem ArtifactStore, but it was not selected");
    }
    if (!hasConfiguredService(configured, selection.stores.credentials)) {
      assert(selection.stores.credentials === "credentials.env",
        `unknown selected CredentialStore ${selection.stores.credentials}`);
      defaults.push(createEnvironmentCredentialStorePackage({ instance: selection.stores.credentials }));
    }
    const assembly = assembleRuntimeServices([...configured, ...defaults], selection);
    assert(assembly.buildStore !== undefined, "project Runtime requires a BuildStore");
    assert(assembly.operationStore !== undefined, "project Runtime requires an OperationStore");
    assert(assembly.artifactStore !== undefined, "project Runtime requires an ArtifactStore");
    assert(assembly.credentialStore !== undefined, "project Runtime requires a CredentialStore");
    const complete: ProjectRuntimeServiceAssembly = {
      ...assembly,
      buildStore: assembly.buildStore,
      operationStore: assembly.operationStore,
      artifactStore: assembly.artifactStore,
      credentialStore: assembly.credentialStore,
    };
    return {
      assembly: complete,
      selection,
      allowedPermissions: [
        ...manifestPermissions(defaults),
        ...(options.allowedPermissions ?? []),
      ],
    };
  } catch (error) {
    return await closeAfterFailure([...configured, ...defaults], error);
  }
}

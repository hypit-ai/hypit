import type { ExecutionClientLease } from "@hypit/execution";

export const projectManifestFormat = "hypit.project";

export type ProjectPackageSelection = {
  readonly name: string;
  readonly catalog: readonly string[];
};

export type ProjectManifest = {
  readonly format: typeof projectManifestFormat;
  readonly name: string;
  readonly packages: readonly ProjectPackageSelection[];
};

export type HypitPackageContribution = {
  readonly kind: string;
  readonly value: unknown;
};

export type HypitPackageCatalogOffering = {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly value: unknown;
};

export type HypitPackageModule = {
  readonly package: string;
  readonly contributions: readonly HypitPackageContribution[];
  readonly catalog: readonly HypitPackageCatalogOffering[];
};

export type ProjectBoundary = {
  readonly root: string;
  readonly manifest: ProjectManifest;
};

/** Access granted by an AIGC Execution Environment for the lifetime of one ProjectHost. */
export type ProjectExecutionClientLease = ExecutionClientLease;

export type ProjectExecutionClient = ProjectExecutionClientLease & {
  readonly environment: string;
};

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

export type ProjectExecutorClient = {
  /** A project-scoped client of one selected AIGC Execution Environment. */
  readonly kind: string;
  readonly client: unknown;
  close(): void | Promise<void>;
};

import type { Facet } from "@hypit/facet";

/** Package-qualified logical address resolved to an explicitly selected installed package. */
export type LogicalPackageAddress = {
  readonly kind: string;
  readonly name: string;
};

/**
 * Executable facets exported by one installed physical package. The Host independently grants
 * each exact Facet kind. Host Facets remain inert unless an owning profile selects the package.
 */
export type PackageContribution = {
  /** Executable contributions remain inert until the owner of their kind selects them. */
  readonly facets?: readonly Facet[];
};

/** Physical owner established by the Host; executable code never self-asserts this identity. */
export type LoadedPackage = {
  readonly specifier: string;
  readonly contribution: PackageContribution;
};

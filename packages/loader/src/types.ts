import type { Facet } from "@hypit/facet";
import type { ModuleManifest } from "@hypit/protocol";

/** Semantic Module declaration carried by one physical package. */
export type ModuleContribution = {
  readonly manifest: ModuleManifest;
  /** Additional author import spellings resolved to this exact Manifest. */
  readonly specifiers?: readonly string[];
};

/** Package-qualified logical address resolved to an explicitly selected installed package. */
export type LogicalPackageAddress = {
  readonly abi: string;
  readonly name: string;
};

/**
 * Executable facets exported by one installed physical package. The Host independently grants
 * each exact Facet ABI. Runtime facets remain inert unless a Runtime Profile selects the package.
 */
export type PackageContribution = {
  readonly format: "hypit.package@1";
  readonly modules?: readonly ModuleContribution[];
  /** Executable contributions remain inert until the owner of their exact ABI selects them. */
  readonly facets?: readonly Facet[];
};

/** Physical owner established by the Host; executable code never self-asserts this identity. */
export type LoadedPackage = {
  readonly specifier: string;
  readonly contribution: PackageContribution;
};

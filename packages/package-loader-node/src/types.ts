import type { ComponentPackage } from "@hypit/component-kit";
import type { HostFacet } from "@hypit/host";
import type { ModuleManifest } from "@hypit/protocol";

/** Semantic Module declaration carried by one physical Node package. */
export type NodeModuleContribution = {
  readonly manifest: ModuleManifest;
  /** Additional author import spellings resolved to this exact Manifest. */
  readonly specifiers?: readonly string[];
};

/** Opaque logical address resolved to an explicitly selected installed package. */
export type LogicalPackageAddress = {
  readonly abi: string;
  readonly name: string;
};

/**
 * Executable facets exported by one installed physical package. The Host independently grants
 * each exact Host ABI. Runtime facets remain inert unless a Runtime Profile selects the package.
 */
export type NodePackageContribution = {
  readonly format: "hypit.node-package@1";
  readonly modules?: readonly NodeModuleContribution[];
  /** Syntax- or Host-specific executable facets, inert until their exact Host ABI selects them. */
  readonly hostFacets?: readonly HostFacet[];
  readonly components?: readonly ComponentPackage[];
};

/** Physical owner established by the Host; executable code never self-asserts this identity. */
export type LoadedPackage = {
  readonly specifier: string;
  readonly contribution: NodePackageContribution;
};

export type NodePackageSelectionRequest = {
  /** Physical packages selected by Source discovery or a Runtime Profile. */
  readonly selected: readonly string[];
  /** Logical capabilities that the selected packages must provide. */
  readonly logical?: readonly LogicalPackageAddress[];
};

export type NodePackageLoadOptions = {
  /**
   * Additional read-only Distribution roots. They are fallbacks for project-scoped packages;
   * the reserved @hypit namespace resolves only from these roots when they are present.
   */
  readonly fallbackRoots?: readonly string[];
  /**
   * Machine npm homes used only by Distribution-owned packages for their ordinary upstream
   * dependencies. Defaults to the roots installed by the Hypit launcher.
   */
  readonly externalRoots?: readonly string[];
};

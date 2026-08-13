import type { ComponentPackage } from "@narratage/component-kit";
import type { HostFacet } from "@narratage/host";
import type { Digest, ModuleManifest } from "@narratage/protocol";

/** Semantic Module declaration carried by one physical Node package. */
export type NodeModuleContribution = {
  readonly manifest: ModuleManifest;
  /** Additional author import spellings resolved to this exact Manifest. */
  readonly specifiers?: readonly string[];
};

/** Opaque logical address resolved by package inventory without interpreting the owning ABI. */
export type LogicalPackageAddress = {
  readonly abi: string;
  readonly name: string;
};

/**
 * Trusted executable facets exported by one installed physical package. The Host independently
 * grants each exact Host ABI separately. Runtime Adapter Host facets remain inert unless a Runtime
 * Profile explicitly selects the physical package through its own lock.
 */
export type NodePackageContribution = {
  readonly format: "svml.node-package@1";
  readonly modules?: readonly NodeModuleContribution[];
  /** Syntax- or Host-specific executable facets, inert until their exact Host ABI selects them. */
  readonly hostFacets?: readonly HostFacet[];
  readonly components?: readonly ComponentPackage[];
};

/** Physical owner established by the Host; executable code never self-asserts this identity. */
export type NodePackageBinding = {
  readonly specifier: string;
  readonly contribution: NodePackageContribution;
};

export type LockedPackageArtifact = {
  readonly name: string;
  readonly version: string;
  readonly digest: Digest;
};

export type LockedNodePackage = {
  readonly package: {
    readonly name: string;
    readonly version: string;
  };
  /** ABI-qualified logical requests this physical package can satisfy. */
  readonly offers: readonly LogicalPackageAddress[];
  /** Digest of declared Module, author and compute facet identities, excluding function objects. */
  readonly facetsDigest: Digest;
  /** Digest of this package's own transitive physical Artifact closure, excluding unrelated selections. */
  readonly closureDigest: Digest;
};

export type NodePackageLock = {
  readonly format: "svml.node-package-lock@1";
  readonly digest: Digest;
  /** Physical packages selected explicitly by the lock author. */
  readonly selected: readonly string[];
  readonly artifacts: readonly LockedPackageArtifact[];
  /** Selected contributions plus the exact Module providers required by their Manifests. */
  readonly packages: readonly LockedNodePackage[];
};

/** Guard used by a direct-selection edit: retained roots may not acquire different bytes. */
export type NodePackageLockCreateOptions = {
  readonly retain?: {
    readonly from: NodePackageLock;
    readonly selected: readonly string[];
  };
};

export type NodePackageSelectionRequest = {
  /** Physical enrollment hints; logical addresses become the sole exact-selection authority. */
  readonly selected: readonly string[];
  /** Logical requests that may be supplied by any trusted inventory package. */
  readonly logical?: readonly LogicalPackageAddress[];
};

export type LoadedNodePackageSet = {
  /** Exact package closure activated for this compilation. */
  readonly lock: NodePackageLock;
  /** Trusted inventory from which the exact closure was selected. */
  readonly inventoryDigest: Digest;
  readonly packages: readonly NodePackageBinding[];
};

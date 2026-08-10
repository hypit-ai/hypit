import type { RegisteredModulePackage } from "@narratage/compiler-node";
import type { ComponentPackage } from "@narratage/component-kit";
import type { AuthorFrontend } from "@narratage/elaborator";
import type { HostFacet } from "@narratage/host";
import type { Digest } from "@narratage/protocol";
import type { RunFrontend } from "@narratage/run";

/**
 * Trusted executable facets exported by one installed physical package. The Host independently
 * grants each exact Host ABI separately. Runtime Adapter Host facets remain inert unless a Runtime
 * Profile explicitly selects the physical package through its own lock.
 */
export type NodePackageContribution = {
  readonly format: "svml.node-package@1";
  readonly name: string;
  readonly modules?: readonly RegisteredModulePackage[];
  readonly authorFrontends?: readonly AuthorFrontend[];
  readonly runFrontends?: readonly RunFrontend[];
  /** Syntax- or Host-specific executable facets, inert until their exact Host ABI selects them. */
  readonly hostFacets?: readonly HostFacet[];
  readonly components?: readonly ComponentPackage[];
};

export type LockedPackageArtifact = {
  readonly name: string;
  readonly version: string;
  readonly digest: Digest;
};

export type LockedNodePackage = {
  /** Node package name used only for installed-package resolution. */
  readonly specifier: string;
  readonly package: {
    readonly name: string;
    readonly version: string;
  };
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

export type LoadedNodePackageSet = {
  readonly lock: NodePackageLock;
  readonly contributions: readonly NodePackageContribution[];
};

import type { RegisteredModulePackage } from "@svml/compiler-node";
import type { ComponentPackage } from "@svml/component-kit";
import type { AuthorFrontend } from "@svml/elaborator";
import type { HostFacet } from "@svml/host";
import type { Digest } from "@svml/protocol";
import type { RunFrontend } from "@svml/run";

/**
 * Trusted executable facets exported by one installed physical package. The Host independently
 * grants author registries or deterministic compute registries; this descriptor has no Provider,
 * credential, store, queue or Runtime facet.
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
};

export type NodePackageLock = {
  readonly format: "svml.node-package-lock@1";
  readonly digest: Digest;
  readonly artifacts: readonly LockedPackageArtifact[];
  readonly packages: readonly LockedNodePackage[];
};

export type LoadedNodePackageSet = {
  readonly lock: NodePackageLock;
  readonly contributions: readonly NodePackageContribution[];
};

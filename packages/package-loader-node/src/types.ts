import type { RegisteredModulePackage } from "@svml/compiler-node";
import type { ComponentPackage } from "@svml/component-kit";
import type { AuthorFrontend } from "@svml/elaborator";
import type { GraphFragment } from "@svml/elaborator";
import type { Digest, ModuleRef } from "@svml/protocol";
import type {
  RawSurfaceHandler,
  StructuredSurfaceHandler,
} from "@svml/text";

export type NodeTextSurfaceFacet =
  | {
      readonly module: ModuleRef;
      readonly surface: string;
      readonly mode: "raw";
      readonly implementationDigest: Digest;
      readonly handler: RawSurfaceHandler;
    }
  | {
      readonly module: ModuleRef;
      readonly surface: string;
      readonly mode: "structured";
      readonly implementationDigest: Digest;
      readonly handler: StructuredSurfaceHandler;
    };

/**
 * Trusted executable facets exported by one installed physical package. The Host independently
 * grants author registries or deterministic compute registries; this descriptor has no Provider,
 * credential, store, queue or Runtime facet.
 */
export type NodePackageActivation = {
  readonly format: "svml.node-package@1";
  readonly name: string;
  readonly modules?: readonly RegisteredModulePackage[];
  readonly frontends?: readonly AuthorFrontend[];
  readonly textSurfaces?: readonly NodeTextSurfaceFacet[];
  readonly components?: readonly ComponentPackage[];
  /** Trusted Run-Graph Fragments, addressable from `.svrun` imports by package and export name. */
  readonly runFragments?: Readonly<Record<string, GraphFragment>>;
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
  readonly packages: readonly NodePackageActivation[];
};

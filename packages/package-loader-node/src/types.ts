import type { RegisteredModulePackage } from "@svml/compiler-node";
import type { AuthorFrontend } from "@svml/elaborator";
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
 * Trusted executable author-compiler facets exported by one installed physical package.
 * It intentionally has no Provider, credential, store, queue or Runtime facet.
 */
export type NodeAuthorPackage = {
  readonly format: "svml.node-author-package@1";
  readonly name: string;
  readonly modules: readonly RegisteredModulePackage[];
  readonly frontends?: readonly AuthorFrontend[];
  readonly textSurfaces?: readonly NodeTextSurfaceFacet[];
};

export type LockedPackageArtifact = {
  readonly name: string;
  readonly version: string;
  readonly digest: Digest;
};

export type LockedAuthorPackage = {
  /** Node package name used only for installed-package resolution. */
  readonly specifier: string;
  readonly package: {
    readonly name: string;
    readonly version: string;
  };
  /** Digest of declared module/frontend/surface identities, excluding executable functions. */
  readonly facetsDigest: Digest;
};

export type NodeAuthorPackageLock = {
  readonly format: "svml.node-author-lock@1";
  readonly digest: Digest;
  readonly artifacts: readonly LockedPackageArtifact[];
  readonly packages: readonly LockedAuthorPackage[];
};

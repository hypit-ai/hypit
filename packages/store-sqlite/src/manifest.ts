import { digestOf } from "@svml/core";
import type { RuntimeModuleManifest } from "@svml/runtime";

export const sqliteStoreModuleRef = {
  name: "@svml/store-sqlite",
  version: "1",
} as const;

export const sqliteBuildStoreFacet = {
  module: sqliteStoreModuleRef,
  name: "build-store",
} as const;

export const sqliteOperationStoreFacet = {
  module: sqliteStoreModuleRef,
  name: "operation-store",
} as const;

export const sqliteBuildStoreImplementationDigest = digestOf(
  "@svml/store-sqlite/build-store@1",
);

export const sqliteOperationStoreImplementationDigest = digestOf(
  "@svml/store-sqlite/operation-store@1",
);

export const sqliteStoreRuntimeManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@1",
  name: sqliteStoreModuleRef.name,
  version: sqliteStoreModuleRef.version,
  facets: [
    {
      name: sqliteBuildStoreFacet.name,
      role: "build-store",
      implementation: {
        locator: "@svml/store-sqlite/build-store",
        digest: sqliteBuildStoreImplementationDigest,
      },
      permissions: ["filesystem:state"],
    },
    {
      name: sqliteOperationStoreFacet.name,
      role: "operation-store",
      implementation: {
        locator: "@svml/store-sqlite/operation-store",
        digest: sqliteOperationStoreImplementationDigest,
      },
      permissions: ["filesystem:state"],
    },
  ],
};

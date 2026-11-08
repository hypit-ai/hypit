import type { ModuleManifest, TypeRef } from "@hypit/protocol";

export const objectTrackModuleRef = { name: "@hypit/object-track", version: "1" } as const;
export const objectTrackTypes = {
  document: { module: objectTrackModuleRef, name: "ObjectTrackDocument" },
} satisfies Record<string, TypeRef>;

export const objectTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: objectTrackModuleRef.name,
  version: objectTrackModuleRef.version,
  dependencies: [],
  types: [objectTrackTypes.document.name],
  capabilities: [],
  producers: [],
};

export const objectTrackDependency = objectTrackModuleRef;

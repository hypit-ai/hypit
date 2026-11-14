import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

export const objectTrackModuleRef = { name: "@hypit/object-track" } as const;
export const objectTrackTypes = {
  document: { module: objectTrackModuleRef, name: "ObjectTrackDocument" },
} satisfies Record<string, TypeRef>;

export const objectTrackManifest: GenerationModuleDefinition = {
  name: objectTrackModuleRef.name,
  dependencies: [],
  types: [objectTrackTypes.document.name],
  capabilities: [],
  producers: [],
};

export const objectTrackDependency = objectTrackModuleRef;

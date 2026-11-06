import type { ModuleManifest, TypeRef } from "@hypit/protocol";

export const textModuleRef = { name: "@hypit/text", version: "1" } as const;

export const textTypes = {
  text: { module: textModuleRef, name: "Text" },
} satisfies Record<string, TypeRef>;

export const textManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: textModuleRef.name,
  version: textModuleRef.version,
  dependencies: [],
  types: [textTypes.text.name],
  capabilities: [],
  producers: [],
};

export const textDependency = textModuleRef;

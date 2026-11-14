import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

export const textModuleRef = { name: "@hypit/text" } as const;

export const textTypes = {
  text: { module: textModuleRef, name: "Text" },
} satisfies Record<string, TypeRef>;

export const textManifest: GenerationModuleDefinition = {
  name: textModuleRef.name,
  dependencies: [],
  types: [textTypes.text.name],
  capabilities: [],
  producers: [],
};

export const textDependency = textModuleRef;

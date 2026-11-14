import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

export const audiovisualExecutionModuleRef = {
  name: "@hypit/audiovisual-execution",
} as const;

export const audiovisualExecutionTypes = {
  pictureOutput: { module: audiovisualExecutionModuleRef, name: "AudiovisualPictureOutput" },
} satisfies Record<string, TypeRef>;

export const audiovisualExecutionManifest: GenerationModuleDefinition = {
  ...audiovisualExecutionModuleRef,
  dependencies: [],
  types: Object.values(audiovisualExecutionTypes).map((type) => type.name),
  capabilities: [],
  producers: [],
};

export const audiovisualExecutionDependency = audiovisualExecutionModuleRef;

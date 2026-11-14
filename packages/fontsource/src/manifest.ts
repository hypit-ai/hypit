import { mediaDependency, mediaTypes } from "@hypit/media";
import type { GenerationModuleDefinition } from "@hypit/hypit/generation/build";

export const fontsourceModuleRef = { name: "@hypit/fontsource" } as const;

export const fontsourceManifest: GenerationModuleDefinition = {
  name: fontsourceModuleRef.name,
  dependencies: [mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

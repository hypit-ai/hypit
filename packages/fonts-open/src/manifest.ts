import { mediaDependency, mediaTypes } from "@hypit/media";
import type { ModuleManifest } from "@hypit/protocol";

export const fontsOpenModuleRef = { name: "@hypit/fonts-open", version: "1" } as const;

export const fontsOpenMarkupSurfaces = [{
    name: "face",
    tag: "Face",
    mode: "structured",
    outputs: [mediaTypes.fontArtifact],
  }, {
    name: "stack",
    tag: "Stack",
    mode: "structured",
    outputs: [mediaTypes.fontStack],
  }] as const;


export const fontsOpenManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fontsOpenModuleRef.name,
  version: fontsOpenModuleRef.version,
  dependencies: [mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

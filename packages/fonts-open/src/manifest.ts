import { mediaDependency, mediaTypes } from "@narratage/media";
import type { ModuleManifest } from "@narratage/protocol";

export const fontsOpenModuleRef = { name: "@narratage/fonts-open", version: "1" } as const;

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
  format: "narratage.module@1",
  name: fontsOpenModuleRef.name,
  version: fontsOpenModuleRef.version,
  dependencies: [mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

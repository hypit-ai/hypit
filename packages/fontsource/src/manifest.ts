import { mediaDependency, mediaTypes } from "@hypit/media";
import type { ModuleManifest } from "@hypit/hypit/protocol";

export const fontsourceModuleRef = { name: "@hypit/fontsource", version: "1" } as const;

export const fontsourceManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: fontsourceModuleRef.name,
  version: fontsourceModuleRef.version,
  dependencies: [mediaDependency],
  types: [],
  capabilities: [],
  producers: [],
};

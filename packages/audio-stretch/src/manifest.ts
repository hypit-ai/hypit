import { audioTrackDependency } from "@hypit/audio-track";
import type { ModuleManifest } from "@hypit/hypit/protocol";

export const audioStretchModuleRef = { name: "@hypit/audio-stretch", version: "1" } as const;

export const audioStretchManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audioStretchModuleRef.name,
  version: audioStretchModuleRef.version,
  dependencies: [audioTrackDependency],
  types: [],
  capabilities: [],
  producers: [],
};

import { blobDependency } from "@hypit/hypit/blob";
import { mediaDependency } from "@hypit/media";
import { temporalDependency } from "@hypit/temporal";
import { htmlProgramModuleRef } from "@hypit/html-program";
import type { ModuleManifest } from "@hypit/hypit/protocol";
import { audioProgramModuleRef } from "@hypit/audio-program";
import { mediaDeliveryModuleRef } from "@hypit/media-delivery";

export const htmlVideoModuleRef = { name: "@hypit/html-video", version: "1" } as const;
export const htmlVideoManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: htmlVideoModuleRef.name,
  version: htmlVideoModuleRef.version,
  dependencies: [
    blobDependency,
    mediaDependency,
    temporalDependency,
    htmlProgramModuleRef,
    audioProgramModuleRef,
    mediaDeliveryModuleRef,
  ],
  types: [],
  capabilities: [],
  producers: [],
};

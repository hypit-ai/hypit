import { blobDependency } from "@hypit/blob";
import { mediaDependency } from "@hypit/media";
import { temporalDependency } from "@hypit/temporal-graph";
import { htmlProgramModuleRef } from "@hypit/html-program";
import type { ModuleManifest } from "@hypit/protocol";
import { audioProgramModuleRef } from "@hypit/audio-program";
import { mediaDeliveryModuleRef } from "@hypit/media-delivery";

export const htmlVideoAuthorModuleRef = { name: "@hypit/html-video-author", version: "1" } as const;
export const htmlVideoAuthorManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: htmlVideoAuthorModuleRef.name,
  version: htmlVideoAuthorModuleRef.version,
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

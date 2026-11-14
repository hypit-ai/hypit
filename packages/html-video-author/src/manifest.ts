import { blobDependency } from "@hypit/blob";
import { mediaDependency } from "@hypit/media";
import { temporalDependency } from "@hypit/temporal-graph";
import { htmlProgramModuleRef } from "@hypit/html-program";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import { audioProgramModuleRef } from "@hypit/audio-program";
import { mediaDeliveryModuleRef } from "@hypit/media-delivery";

export const htmlVideoAuthorModuleRef = { name: "@hypit/html-video-author" } as const;
export const htmlVideoAuthorManifest: GenerationModuleDefinition = {
  name: htmlVideoAuthorModuleRef.name,
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

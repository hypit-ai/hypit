import { blobDependency } from "@hypit/blob";
import { mediaDependency } from "@hypit/media";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import { temporalDependency } from "@hypit/temporal-graph";

export const mediaAuthorModuleRef = { name: "@hypit/media-author" } as const;
export const mediaAuthorManifest: GenerationModuleDefinition = {
  name: mediaAuthorModuleRef.name,
  dependencies: [blobDependency, mediaDependency, temporalDependency],
  types: [],
  capabilities: [],
  producers: [],
};

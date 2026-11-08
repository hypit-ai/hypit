import { blobDependency } from "@hypit/blob";
import { mediaDependency } from "@hypit/media";
import type { ModuleManifest } from "@hypit/protocol";
import { temporalDependency } from "@hypit/temporal-graph";

export const mediaAuthorModuleRef = { name: "@hypit/media-author", version: "1" } as const;
export const mediaAuthorManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaAuthorModuleRef.name,
  version: mediaAuthorModuleRef.version,
  dependencies: [blobDependency, mediaDependency, temporalDependency],
  types: [],
  capabilities: [],
  producers: [],
};

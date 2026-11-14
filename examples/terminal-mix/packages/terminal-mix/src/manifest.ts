import { audiovisualDependency } from "@hypit/audiovisual";
import type { GenerationModuleDefinition } from "@hypit/hypit/generation/build";

import { terminalMixModuleRef } from "./identity.js";

export const terminalMixManifest: GenerationModuleDefinition = {
  name: terminalMixModuleRef.name,
  dependencies: [audiovisualDependency],
  types: [],
  capabilities: [],
  producers: [],
};

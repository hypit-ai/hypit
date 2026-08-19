import type { ModuleManifest } from "@hypit/protocol";
export { assertVisualStyleV1, VISUAL_IR_V1, VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "./style.js";
export type * from "./style.js";
export const visualIrModuleRef = { name: "@hypit/visual-ir", version: "1" } as const;
export const visualIrManifest: ModuleManifest = { format: "hypit.module@1", name: visualIrModuleRef.name, version: visualIrModuleRef.version,
  dependencies: [], types: [], capabilities: [], producers: [] };
export const visualIrDependency = { module: visualIrModuleRef } as const;

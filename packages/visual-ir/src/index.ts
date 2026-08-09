import { digestOf } from "@narratage/protocol";
import type { ModuleManifest } from "@narratage/protocol";
export { assertVisualStyleV1, VISUAL_IR_V1, VISUAL_STYLE_ENUM_VALUES_V1, VISUAL_STYLE_NAMES_V1 } from "./style.js";
export type * from "./style.js";
export const visualIrModuleRef = { name: "@narratage/visual-ir", version: "1" } as const;
export const visualIrManifest: ModuleManifest = { format: "svml.module@1", name: visualIrModuleRef.name, version: visualIrModuleRef.version,
  dependencies: [], types: [], capabilities: [], surfaces: [], producers: [] };
export const visualIrManifestDigest = digestOf(visualIrManifest);
export const visualIrDependency = { module: visualIrModuleRef, digest: visualIrManifestDigest } as const;

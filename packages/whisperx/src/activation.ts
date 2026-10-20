import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import {
  decodeWhisperXAlignmentSurface, whisperXComponent,
  whisperXManifest, whisperXModuleRef,
  whisperXMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: whisperXManifest }],
  facets: [
    ...[whisperXComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),createMarkupSurfaceFacet({
    module: whisperXModuleRef,
    declaration: whisperXMarkupSurfaces.find((item) => item.name === "alignment")!,
    handler: decodeWhisperXAlignmentSurface,
  })],
};
export default hypitPackage;

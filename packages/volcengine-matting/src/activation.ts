import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { portraitMattingSurface, volcengineMattingDefinition, volcengineMattingModuleRef } from "./index.js";
import { decodePortraitMattingSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: volcengineMattingDefinition.manifest }],
  facets: [
    ...[volcengineMattingDefinition.component].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]), createMarkupSurfaceFacet({
    module: volcengineMattingModuleRef, declaration: portraitMattingSurface, handler: decodePortraitMattingSurface,
  })],
};
export default hypitPackage;

import { createAuthorEditPlannerFacet } from "@hypit/hypit/author";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createNleSubjectProjectorFacet } from "@hypit/nle-view";
import { createNlePackageFacet } from "@hypit/nle";
import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";

import { captionComponent } from "./component.js";
import { captionAuthorFacets } from "./declaration.js";
import { captionComponentEditPlanner } from "./edit.js";
import { captionHtmlManifest, captionManifest } from "./manifest.js";
import { captionNleSubjectProjector } from "./nle.js";
import { captionBasicNleHtmlVideoResolver, captionBasicNleResolver } from "./nle-package.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: captionManifest }, { manifest: captionHtmlManifest }],
  facets: [
    createProducerPackageFacet(captionComponent.producers),
    createRefinementPackageFacet(captionComponent.refinements),
    createAuthorEditPlannerFacet(captionComponentEditPlanner),
    createNleSubjectProjectorFacet(captionNleSubjectProjector),
    createNlePackageFacet({ components: [captionBasicNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [captionBasicNleHtmlVideoResolver] }),
    ...captionAuthorFacets,
  ],
};

export default hypitPackage;

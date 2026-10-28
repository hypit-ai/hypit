import { createInvocationFrontendFacet } from "@hypit/invocation";

import { invocationMarkupFrontend } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  facets: [createInvocationFrontendFacet(invocationMarkupFrontend)],
};

export default hypitPackage;

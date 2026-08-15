import {
  createRuntimeInfrastructureAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
} from "@narratage/runtime-kit";

import { createLocalExecutionPackage } from "./scheduler-package.js";
import { localRuntimeHostAdapter } from "./host.js";

const localExecutionAdapter = createRuntimeInfrastructureAdapterFacet({
  use: "@narratage/runtime-local",
  validate(context) {
    const config = runtimeConfigObject(context.config, "local execution");
    runtimeConfigExact(config, [], "local execution");
  },
  create(context) {
    return createLocalExecutionPackage(context.instance);
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [localRuntimeHostAdapter, localExecutionAdapter],
};

export default narratagePackage;

import {
  createRuntimeComponentAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
} from "@narratage/runtime-adapter";

import { createLocalExecutionPackage } from "./scheduler-package.js";
import { localRuntimeHostAdapter } from "./host.js";

const localExecutionAdapter = createRuntimeComponentAdapterFacet({
  use: "@narratage/local",
  validate(context) {
    const config = runtimeConfigObject(context.config, "local execution");
    runtimeConfigExact(config, [], "local execution");
  },
  create(context) {
    return createLocalExecutionPackage(context.instance);
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  hostFacets: [localRuntimeHostAdapter, localExecutionAdapter],
};

export default svmlPackage;

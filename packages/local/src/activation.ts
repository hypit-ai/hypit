import {
  createRuntimeServiceAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
} from "@narratage/runtime-adapter";

import { createLocalExecutionPackage } from "./scheduler-package.js";

const localExecutionAdapter = createRuntimeServiceAdapterFacet({
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
  name: "@narratage/local",
  hostFacets: [localExecutionAdapter],
};

export default svmlPackage;

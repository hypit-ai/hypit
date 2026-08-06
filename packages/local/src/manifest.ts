import { digestOf } from "@svml/protocol";
import type { RuntimeModuleManifest } from "@svml/runtime";

export const localRuntimeModuleRef = {
  name: "@svml/local",
  version: "1",
} as const;

export const localSchedulerFacet = {
  module: localRuntimeModuleRef,
  name: "scheduler",
} as const;

export const localSchedulerImplementationDigest = digestOf("@svml/local/scheduler@1");

export const localRuntimeManifest: RuntimeModuleManifest = {
  format: "svml.runtime-module@2",
  name: localRuntimeModuleRef.name,
  version: localRuntimeModuleRef.version,
  facets: [
    {
      name: localSchedulerFacet.name,
      role: "scheduler",
      implementation: {
        locator: "@svml/local/scheduler",
        digest: localSchedulerImplementationDigest,
      },
      permissions: [],
    },
  ],
};

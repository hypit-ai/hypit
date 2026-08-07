import { digestOf } from "@svml/protocol";
import {
  LocalBuildScheduler,
  defineRuntimeServicePackage,
} from "@svml/runtime";
import type { RuntimeServicePackage } from "@svml/runtime";

export const localRuntimeModuleRef = {
  name: "@svml/local",
  version: "1",
} as const;

export const localSchedulerImplementationDigest = digestOf("@svml/local/scheduler@1");

export function createLocalSchedulerPackage(
  instance = "scheduler.local",
): RuntimeServicePackage {
  return defineRuntimeServicePackage({
    name: instance,
    module: localRuntimeModuleRef,
    services: [{
      role: "scheduler",
      facet: "scheduler",
      instance,
      implementation: {
        locator: "@svml/local/scheduler",
        digest: localSchedulerImplementationDigest,
      },
      configuration: { algorithm: "queue-free-fair-lanes", version: 1 },
      service: {
        create(executor, options) {
          return new LocalBuildScheduler(executor, options);
        },
      },
    }],
  });
}

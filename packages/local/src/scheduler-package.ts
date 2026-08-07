import { digestOf } from "@narratage/protocol";
import {
  LocalBuildScheduler,
  defineRuntimeServicePackage,
} from "@narratage/runtime";
import type { RuntimeServicePackage } from "@narratage/runtime";

export const localRuntimeModuleRef = {
  name: "@narratage/local",
  version: "1",
} as const;

export const localSchedulerImplementationDigest = digestOf("@narratage/local/scheduler@1");

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
        locator: "@narratage/local/scheduler",
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

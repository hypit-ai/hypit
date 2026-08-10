import { digestOf } from "@narratage/protocol";
import {
  LocalBuildScheduler,
  defineRuntimeServicePackage,
} from "@narratage/runtime";
import type { RuntimeServicePackage } from "@narratage/runtime";

import { durableLocalWorkerFactory } from "./worker.js";

export const localRuntimeModuleRef = {
  name: "@narratage/local",
  version: "1",
} as const;

export const localSchedulerImplementationDigest = digestOf("@narratage/local/scheduler@1");
export const localWorkerImplementationDigest = digestOf("@narratage/local/worker@1");

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

export function createLocalExecutionPackage(
  instance: string,
): RuntimeServicePackage {
  return defineRuntimeServicePackage({
    name: instance,
    module: localRuntimeModuleRef,
    services: [
      {
        role: "scheduler",
        facet: "scheduler",
        instance: `${instance}.scheduler`,
        implementation: {
          locator: "@narratage/local/scheduler",
          digest: localSchedulerImplementationDigest,
        },
        configuration: { algorithm: "fair-lanes", version: 1 },
        service: {
          create(executor, options) {
            return new LocalBuildScheduler(executor, options);
          },
        },
      },
      {
        role: "worker",
        facet: "worker",
        instance: `${instance}.worker`,
        implementation: {
          locator: "@narratage/local/worker",
          digest: localWorkerImplementationDigest,
        },
        configuration: { dispatch: "leased", capacity: "shared", version: 1 },
        service: durableLocalWorkerFactory,
      },
    ],
  });
}

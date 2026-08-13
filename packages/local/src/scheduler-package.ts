import { digestOf } from "@narratage/protocol";
import {
  LocalBuildScheduler,
  defineRuntimeServicePackage,
} from "@narratage/runtime";
import type { RuntimeServicePackage } from "@narratage/runtime";

import { durableLocalWorkerFactory } from "./worker.js";

const localRuntimeModuleRef = {
  name: "@narratage/local",
  version: "1",
} as const;

const localSchedulerImplementationDigest = digestOf("@narratage/local/scheduler@1");
const localWorkerImplementationDigest = digestOf("@narratage/local/worker@1/blocked-subject");

export function createLocalExecutionPackage(
  instance: string,
): RuntimeServicePackage {
  return defineRuntimeServicePackage({
    module: localRuntimeModuleRef,
    services: [
      {
        role: "scheduler",
        facet: "scheduler",
        instance: `${instance}.scheduler`,
        implementation: {
          digest: localSchedulerImplementationDigest,
        },
        configuration: { algorithm: "atomic-resources", version: 1 },
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
          digest: localWorkerImplementationDigest,
        },
        configuration: { dispatch: "leased", capacity: "shared", version: 1 },
        service: durableLocalWorkerFactory,
      },
    ],
  });
}

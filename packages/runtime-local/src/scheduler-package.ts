import {
  LocalBuildScheduler,
  defineRuntimeInfrastructurePackage,
} from "@narratage/runtime";
import type { RuntimeInfrastructurePackage } from "@narratage/runtime";

import { durableLocalWorkerFactory } from "./worker.js";

const localRuntimeModuleRef = {
  name: "@narratage/runtime-local",
  version: "1",
} as const;

export function createLocalExecutionPackage(
  instance: string,
): RuntimeInfrastructurePackage {
  return defineRuntimeInfrastructurePackage({
    module: localRuntimeModuleRef,
    instance,
    parts: [
      {
        role: "scheduler",
        part: "scheduler",
        facet: "scheduler",
        port: {
          create(executor, options) {
            return new LocalBuildScheduler(executor, options);
          },
        },
      },
      {
        role: "worker",
        part: "worker",
        facet: "worker",
        port: durableLocalWorkerFactory,
      },
    ],
  });
}

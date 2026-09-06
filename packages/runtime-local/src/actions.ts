import type { BuildExecutionStore, RuntimeActionExecutor } from "@hypit/runtime";

/** All short Endpoint actions use the Runtime's existing shared resource authority. */
export function createActionExecutor(store: BuildExecutionStore): RuntimeActionExecutor {
  return {
    async run(request, execute) {
      const command = `action:${JSON.stringify([request.command, request.action])}`;
      const acquired = await store.acquireCapacity({
        build: request.build, command, lifetime: "action", resources: request.resources, now: Date.now(),
      });
      if (acquired.status === "blocked") return {
        status: "deferred",
        ...(acquired.availableAt === undefined ? {} : { wakeAt: acquired.availableAt }),
        reason: `${acquired.reason}:${acquired.resource}`,
      };
      try { return { status: "completed", value: await execute() }; }
      finally { await store.releaseCapacity(request.build, command); }
    },
  };
}

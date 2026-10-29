import { setImmediate, setTimeout as pause } from "node:timers/promises";
import { createNodeModuleImporter } from "@hypit/hypit/loader/node/module-importer";
import type { NodeModuleImporter } from "@hypit/hypit/loader/node/module-importer";
import { SqliteRuntimeState } from "./sqlite-state.js";
import { createRuntimeForBuild, statePath } from "./config.js";
import type { LocalRuntime } from "./types.js";

type Context = { readonly scope: NodeModuleImporter; readonly runtime: LocalRuntime; task?: Promise<void> };

/** A shared execution carrier. Database readiness selects work; waiting is not an occupied process. */
export async function executeBuilds(dataRoot: string, signal: AbortSignal): Promise<void> {
  const state = new SqliteRuntimeState(statePath(dataRoot));
  const pending = new Set<string>();
  const contexts = new Map<string, Context>();
  const finished = (build: string, error?: unknown): void => {
    process.send?.({ kind: "build-finished", build, rssBytes: process.memoryUsage.rss(),
      ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }) });
  };
  const receive = (message: unknown): void => {
    if (typeof message === "object" && message !== null && "kind" in message && message.kind === "start-build"
      && "build" in message && typeof message.build === "string") pending.add(message.build);
  };
  const close = async (build: string, context: Context): Promise<void> => {
    contexts.delete(build);
    try { await context.runtime.close(); } finally { context.scope.close(); }
  };
  process.on("message", receive);
  process.send?.({ kind: "executor-ready" });
  try {
    while (!signal.aborted) {
      for (const build of await state.execution.listReady()) {
        if (signal.aborted) break;
        let context = contexts.get(build);
        if (context === undefined && pending.delete(build)) {
          const scope = createNodeModuleImporter();
          try {
            const runtime = await createRuntimeForBuild(dataRoot, build, { state, importModule: (url) => scope.import(url) });
            context = { scope, runtime };
            contexts.set(build, context);
            process.send?.({ kind: "executor-memory", rssBytes: process.memoryUsage.rss() });
          } catch (error) { scope.close(); finished(build, error); }
        }
        if (context === undefined || context.task !== undefined) continue;
        const current = context;
        let hydrated!: () => void;
        const hydration = new Promise<void>((resolve) => { hydrated = resolve; });
        current.task = current.runtime.workOnce({ build, hydrated }).then(async (result) => {
          if (result !== undefined && ("outcome" in result || result.decision !== undefined)) {
            await close(build, current); finished(build);
          }
        }).catch(async (error: unknown) => {
          await close(build, current).catch(() => undefined); finished(build, error);
        }).finally(() => { delete current.task; });
        // Only local hydration is sequenced. Slow submission/poll/collection continues
        // asynchronously while the next ready Build advances its independent work.
        await Promise.race([hydration, current.task]);
        await setImmediate();
      }
      await pause(25, undefined, { signal }).catch((error) => { if (!signal.aborted) throw error; });
    }
  } finally {
    process.removeListener("message", receive);
    await Promise.allSettled([...contexts.values()].flatMap((item) => item.task === undefined ? [] : [item.task]));
    await Promise.allSettled([...contexts].map(([build, context]) => close(build, context)));
    state.close();
  }
}

import { fileExecutionLogs } from "../../src/log.js";
import { FileResourceStore } from "../../src/resource-store.js";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { defineBuild } from "@hypit/kernel";
import { FileBuildResultRepository } from "@hypit/result/node";
import { buildExecutionActivity, createLocalRuntime } from "@hypit/runtime-local";
import type { BuildCompletion } from "@hypit/runtime-local";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  type RuntimeBuildFixture,
} from "../execution-scenario.js";
import type { BuildView } from "@hypit/kernel";

export function definition(state: BuildView, program = state.program) {
  return defineBuild({
    program,
    plan: state.plan,
  });
}

export function projectRuntimeFixture(directory: string) {
  const state = new SqliteRuntimeState(join(directory, ".hypit", "runtime.sqlite"));
  const work = join(directory, ".hypit", "work");
  return {
    executionLogs: fileExecutionLogs((build) => join(work, build)),
    buildStore: state.builds,
    operationStore: state.operations,
    commandExecutionStore: state.commandExecutions,
    executionStore: state.execution,
    removeActiveBuild: async (build: string) => await state.removeActiveBuild(build),
    submissionStore: state.submissions,
    resourceStore: new FileResourceStore(join(directory, ".hypit", "artifacts")),
    resourceStoreForBuild: (build: string) => new FileResourceStore(join(work, build)),
    clearBuildResources: async (build: string) => {
      await rm(join(work, build), { recursive: true, force: true });
    },
    openBuildResultRepository: async (location: import("@hypit/runtime-local").BuildResultRepositoryLocation) =>
      ({ repository: new FileBuildResultRepository(join(location.root, location.path)) }),
    credentialStore: new EnvironmentCredentialStore(),
    close: () => state.close(),
  } as const;
}

export function resultDestination(directory: string) {
  return {
    repository: { root: directory, path: "results" },
  } as const;
}

export function publication(
  outputs: readonly { readonly name: string; readonly ref: { readonly id: string } }[],
  fixture: RuntimeBuildFixture,
) {
  return { outputs: outputs.map((published) => {
    const output = fixture.outputs[published.ref.id];
    if (output === undefined) throw new Error(`Fixture has no Output ${published.ref.id}`);
    return {
      name: published.name,
      output: output.output,
      type: output.type,
      target: output.goal,
      record: output.record,
    };
  }) };
}

export function durableBuildRequest(
  directory: string,
  id: string,
  fixture: RuntimeBuildFixture,
) {
  const targets = Object.values(fixture.outputs).filter((output) => output.goal);
  const publishedOutputs = targets.map((output, index) => ({
    name: `target.${index + 1}`,
    ref: { kind: "logical-output" as const, id: output.output },
  }));
  return {
    id,
    definition: definition(fixture.state),
    authoring: {
      sourcePath: join(directory, "main.svml"),
      publication: publication(publishedOutputs, fixture),
    },
    result: resultDestination(directory),
  } as const;
}

export async function finishClaimedBuild(
  runtime: Awaited<ReturnType<typeof createLocalRuntime>>,
): Promise<BuildCompletion> {
  let snapshot;
  for (let index = 0; index < 4; index += 1) {
    snapshot = await runtime.workOnce();
    if (snapshot !== undefined && "outcome" in snapshot) return snapshot;
  }
  throw new Error(`Build did not finish; last activity was ${snapshot === undefined
    ? "none" : "wakeAt" in snapshot ? buildExecutionActivity(snapshot) : "removed"}`);
}

// An embedding test supplies implementations explicitly and advances their owned turns.
// Production process lifecycle is exercised through superviseBuilds in the process tests.
export async function runFixture(runtime: Awaited<ReturnType<typeof createLocalRuntime>>,
  store: import("@hypit/runtime-local").BuildExecutionStore,
  options: {idlePollMs:number,signal:AbortSignal}): Promise<void> {
  const active = new Map<string,Promise<void>>();
  let failure: unknown;
  try {
    while (!options.signal.aborted && failure === undefined) {
      for (const build of await store.listReady()) {
        if (active.has(build)) continue;
        const task = runtime.workOnce({build}).then(() => undefined)
          .catch((error: unknown) => { failure = error; }).finally(() => active.delete(build));
        active.set(build,task);
      }
      await new Promise((resolve) => setTimeout(resolve,options.idlePollMs));
    }
  } finally { await Promise.all(active.values()); }
  if (failure !== undefined) throw failure;
}

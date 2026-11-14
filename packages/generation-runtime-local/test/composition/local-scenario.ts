import { fileExecutionLogs } from "../../src/log.js";
import { FileResourceStore } from "@hypit/resource-store/node";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";
import { EnvironmentCredentialStore } from "./environment-credential-store.js";
import { defineBuild } from "@hypit/generation-build";
import { FileBuildFinalizationStore } from "../../src/result-storage/index.js";
import { FileBuildResultHistory } from "@hypit/result/node";
import { FileProductHistory } from "@hypit/product/node";
import { buildExecutionActivity, createLocalRuntime } from "@hypit/generation-runtime-local";
import type { BuildCompletion } from "@hypit/generation-runtime-local";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  type RuntimeBuildFixture,
} from "../execution-scenario.js";
import type { BuildView } from "@hypit/generation-build";

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
    openPublicationStores: async (location: import("@hypit/generation-runtime-local").PublicationStoreLocation) => {
      const finalization = new FileBuildFinalizationStore(
        join(location.root, location.historyPath),
        join(location.root, location.productsPath),
      );
      return {
        history: new FileBuildResultHistory(join(location.root, location.historyPath)),
        products: new FileProductHistory(join(location.root, location.productsPath)),
        finalization,
      };
    },
    credentialStore: new EnvironmentCredentialStore(),
    close: () => state.close(),
  } as const;
}

export function publicationStoreLocation(directory: string) {
  return {
    root: directory,
    historyPath: "results",
    productsPath: ".hypit/generation/products",
  } as const;
}

export function publicationIntent(
  outputs: readonly { readonly name: string; readonly ref: { readonly id: string } }[],
  fixture: RuntimeBuildFixture,
) {
  return { outputs: outputs.map((published) => {
    const output = fixture.outputs[published.ref.id];
    if (output === undefined) throw new Error(`Fixture has no Output ${published.ref.id}`);
    return {
      name: published.name,
      record: output.record,
      publisher: "example.test-product@1",
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
      targets: publishedOutputs.map((output) => output.name),
      publication: publicationIntent(publishedOutputs, fixture),
    },
    publicationStores: publicationStoreLocation(directory),
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
  store: import("@hypit/generation-runtime-local").BuildExecutionStore,
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

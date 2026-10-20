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
  createGreetingBuild,
  types,
} from "../execution-scenario.js";

export function definition(state: ReturnType<typeof createGreetingBuild>, program = state.program) {
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
    buildCatalog: state.catalog,
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
  state: ReturnType<typeof createGreetingBuild>,
) {
  const targets = fixtureTargets(state);
  const selected = new Set(targets);
  const outputTypes = new Map([
    ["prompt", types.prompt],
    ["generated", types.generated],
    ["document", types.document],
    ["side-generated", types.generated],
    ["side-document", types.document],
  ]);
  return { outputs: outputs.map((published) => ({
    name: published.name,
    output: published.ref.id,
    type: (() => {
      const type = outputTypes.get(published.ref.id)
        ?? (published.ref.id.startsWith("generated-") ? types.generated : undefined);
      if (type === undefined) throw new Error(`Fixture has no Type for ${published.ref.id}`);
      return type;
    })(),
    target: selected.has(published.ref.id),
    source: { kind: "current-record" as const, record: fixtureRecord(state, published.ref.id) },
  })) };
}

export function fixtureOutput(record: string): string | undefined {
  if (record === "prompt:root") return "prompt";
  if (record === "generated:root" || record === "generated:placeholder") return "generated";
  if (record === "document:root") return "document";
  if (record === "generated:side") return "side-generated";
  if (record === "document:side") return "side-document";
  const generation = /^generated:(.+)$/u.exec(record)?.[1];
  return generation === undefined ? undefined : `generated-${generation}`;
}

export function fixtureRecord(state: ReturnType<typeof createGreetingBuild>, output: string): string {
  const stepId = output === "prompt"
    ? "make-prompt"
    : output === "generated"
      ? state.plan.steps.some((step) => step.id === "request-text") ? "request-text" : "placeholder-text"
      : output === "document"
        ? "assemble"
        : output === "side-generated"
          ? "side-placeholder"
          : output === "side-document"
            ? "side-assemble"
            : output.startsWith("generated-")
              ? `generate-${output.slice("generated-".length)}`
              : undefined;
  const step = state.plan.steps.find((item) => item.id === stepId);
  const record = step === undefined
    ? state.plan.goals.find((goal) => fixtureOutput(goal) === output)
    : step.result.record;
  if (record === undefined) throw new Error(`Fixture has no selected Record for Output ${output}`);
  return record;
}

export function fixtureTargets(state: ReturnType<typeof createGreetingBuild>): readonly string[] {
  return state.plan.goals.map((record) => {
    const output = fixtureOutput(record);
    if (output === undefined) throw new Error(`Fixture has no Output for goal ${record}`);
    return output;
  });
}

export function durableBuildRequest(
  directory: string,
  id: string,
  initial: ReturnType<typeof createGreetingBuild>,
) {
  const targets = fixtureTargets(initial);
  const publishedOutputs = targets.map((output, index) => ({
    name: `target.${index + 1}`,
    ref: { kind: "logical-output" as const, id: output },
  }));
  return {
    id,
    definition: definition(initial),
    catalog: {
      source: { path: join(directory, "main.svml") },
      publication: publication(publishedOutputs, initial),
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

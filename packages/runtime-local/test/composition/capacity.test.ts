import { fileExecutionLogs } from "../../src/log.js";
import { readExecutionLog } from "@hypit/runtime";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { FileResourceStore } from "../../src/resource-store.js";
import { FileBuildResultRepository } from "@hypit/result/node";
import type { BuildResultRepository } from "@hypit/result";
import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { defineEndpoint } from "@hypit/endpoint";
import type { AsyncEndpoint, EndpointInstance } from "@hypit/endpoint";
import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerPackage } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import type { RefinementPackage } from "@hypit/refinement";
import { createLocalRuntime } from "@hypit/runtime-local";
import { resolveProjectRoot } from "@hypit/project";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";
import { defineBuild, link } from "@hypit/kernel";
import { loadNodePackageSelection } from "@hypit/loader/node";
import { credentialRef } from "@hypit/runtime";
import { buildExecutionActivity } from "@hypit/runtime-local";
import type { BuildCompletion } from "@hypit/runtime-local";
import type { CredentialValue, WritableCredentialStore } from "@hypit/runtime";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";

import {
  capabilities,
  createGreetingBuild,
  createParallelGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../execution-scenario.js";

import {
  definition,
  durableBuildRequest,
  finishClaimedBuild,
  fixtureTargets,
  projectRuntimeFixture,
  publication,
  resultDestination,
  runFixture,
} from "./local-scenario.js";

test("one local Worker admits later Builds while preserving shared Endpoint capacity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-bld_20260902T120000011Z_0000000001uilds-"));
  const fixture = projectRuntimeFixture(directory);
  let activeBuildReads = 0;
  let mostBuildReads = 0;
  let unrestrictedActive = 0;
  let mostUnrestricted = 0;
  let limitedActive = 0;
  let mostLimited = 0;
  let markFirstStarted: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
  // The overlap this test is about has to be waited for, not timed. Holding the first handler for a
  // fixed span asks the machine to admit the later Build inside that span, which a loaded runner
  // misses; holding it until the second handler actually starts asks the Worker the question.
  let markSecondStarted: (() => void) | undefined;
  const secondStarted = new Promise<void>((resolve) => { markSecondStarted = resolve; });
  let unrestrictedStarts = 0;
  const components: ProducerPackage & RefinementPackage = {
    producers: [
      {
        producer: producers.makePrompt,
        handler: async ({ inputs }) => {
          if (inputs.intent === undefined) throw new Error("missing greeting intent");
          const intent = inputs.intent.value as { readonly name: string };
          unrestrictedActive += 1;
          mostUnrestricted = Math.max(mostUnrestricted, unrestrictedActive);
          unrestrictedStarts += 1;
          if (unrestrictedStarts === 1) {
            markFirstStarted?.();
            markFirstStarted = undefined;
            // A Worker that serialized the Builds never starts the second one, so this waits out
            // its bound and the assertion below reports that rather than hanging here.
            await Promise.race([
              secondStarted,
              new Promise<void>((settle) => { setTimeout(settle, 10_000).unref(); }),
            ]);
          } else {
            markSecondStarted?.();
            markSecondStarted = undefined;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          unrestrictedActive -= 1;
          return { kind: "output", value: (`Greet ${intent.name}`) };
        },
      },
      {
        producer: producers.requestText,
        handler: ({ inputs }) => {
          if (inputs.prompt === undefined) throw new Error("missing greeting prompt");
          return { kind: "need", constraints: { prompt: inputs.prompt.value } };
        },
      },
      {
        producer: producers.assemble,
        handler: ({ inputs }) => {
          if (inputs.generated === undefined) throw new Error("missing generated greeting");
          return { kind: "output", value: ({ text: inputs.generated.value }) };
        },
      },
    ],
  };
  const endpoint = defineEndpoint({
    instance: "generation.serial",
    pool: "generation.serial",
    defaultConcurrency: 1,
    capabilities: [{
      lifecycle: "immediate",
      capability: capabilities.generation,
      returns: types.generated,
      handler: async () => {
        limitedActive += 1;
        mostLimited = Math.max(mostLimited, limitedActive);
        await new Promise((resolve) => setTimeout(resolve, 80));
        limitedActive -= 1;
        return { value: ("Hello") };
      },
    }],
  });
  let controller: AbortController | undefined;
  let work: Promise<void> | undefined;
  try {
    const runtime = await createLocalRuntime({
      ...fixture,
      buildStore: {
        create: (...args) => fixture.buildStore.create(...args),
        append: (...args) => fixture.buildStore.append(...args),
        read: async (...args) => {
          activeBuildReads += 1;
          mostBuildReads = Math.max(mostBuildReads, activeBuildReads);
          await new Promise((resolve) => setTimeout(resolve, 20));
          try {
            return await fixture.buildStore.read(...args);
          } finally {
            activeBuildReads -= 1;
          }
        },
        remove: (...args) => fixture.buildStore.remove!(...args),
      },
      producerPackages: [components], refinementPackages: [components],
      endpoints: [endpoint],
    });
    await runtime.build(durableBuildRequest(directory, "bld_20260902T120000010Z_0000000001", createGreetingBuild()));
    controller = new AbortController();
    work = runFixture(runtime, fixture.executionStore, { idlePollMs: 5, signal: controller.signal });
    await firstStarted;
    await runtime.build(durableBuildRequest(directory, "bld_20260902T120000011Z_0000000001", createGreetingBuild()));
    const results = new FileBuildResultRepository(join(directory, "results"));
    // Waiting without a deadline for an outcome that never arrives is indistinguishable from a
    // suite that has stopped: no assertion fails and nothing further is printed. Carry the last
    // outcomes into the failure so a Build that stalled is named rather than guessed at.
    const ids = ["bld_20260902T120000010Z_0000000001", "bld_20260902T120000011Z_0000000001"];
    const deadline = Date.now() + 30_000;
    // The manifest carries the reason beside the outcome, and a Build that failed for a reason
    // nobody printed is what the earlier runs of this test came down to.
    let state = "";
    while (true) {
      const manifests = await Promise.all(ids.map(async (id) => await results.read(id)));
      state = ids.map((id, at) => {
        const manifest = manifests[at];
        const reason = manifest?.failure === undefined ? "" : ` (${manifest.failure})`;
        return `${id} is ${manifest?.outcome ?? "unwritten"}${reason}`;
      }).join(", ");
      if (manifests.every((manifest) => manifest?.outcome === "complete")) break;
      // Only `complete` ends this wait, so a Build that reached `failed` would otherwise be waited
      // on until the deadline and reported as a stall. Say which outcome it actually reached.
      if (manifests.some((manifest) => manifest?.outcome !== undefined && manifest.outcome !== "complete")) {
        assert.fail(`Builds reached ${state}`);
      }
      if (Date.now() > deadline) {
        // A Build with no Result at all has not failed, it has stopped being scheduled. `wakeAt`
        // absent means it is waiting for a resource release, and the Operations say whether one is
        // still outstanding; both are what distinguishes a lost wake-up from ordinary waiting.
        const executions = await fixture.executionStore.list();
        const operations = await Promise.all(ids.map(async (id) => await fixture.operationStore.list({ build: id })));
        assert.fail(`Builds did not complete within 30s: ${state}`
          + `; executions ${JSON.stringify(executions)}`
          + `; operations ${JSON.stringify(operations)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    controller.abort();
    await work;
    assert.equal(mostUnrestricted, 2, "a later Build must join work already in progress");
    assert.equal(mostLimited, 1, "declared capacity must span independent Builds");
    await runtime.close();
  } finally {
    // The work loop holds the SQLite state, so it stops before that state closes. Closing under a
    // running Worker turns its next claim into an unhandled rejection, and leaving it open makes
    // the removal below fail with EBUSY on Windows; either one replaces the error that failed the
    // test. A loop that will not stop is its own finding and must not hold up this cleanup.
    controller?.abort();
    await Promise.race([
      work?.catch(() => undefined) ?? Promise.resolve(),
      new Promise<void>((settle) => { setTimeout(settle, 5_000).unref(); }),
    ]);
    try { fixture.close(); } catch { /* the passing path closed it already */ }
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

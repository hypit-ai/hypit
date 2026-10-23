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
  createGreetingBuildFixture,
  createParallelGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../execution-scenario.js";

import {
  definition,
  durableBuildRequest,
  finishClaimedBuild,
  projectRuntimeFixture,
  publication,
  resultDestination,
  runFixture,
} from "./local-scenario.js";

test("concurrent durable Builds preserve action capacity and outcomes across failures", { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-concurrent-builds-"));
  const fixture = projectRuntimeFixture(directory);
  let starts = 0, activeTasks = 0, peakTasks = 0, downloads = 0, peakDownloads = 0;
  const checks = new Map<number, number>();
  const provider = defineEndpoint({
    instance: "concurrent", pool: "shared-account",
    defaultConcurrency: 8,
    actionLimits: { submit: { concurrency: 2 }, collect: { concurrency: 2 } },
    capabilities: [{ capability: capabilities.generation, returns: types.generated, lifecycle: "asynchronous", endpoint: {
      async start() {
        const id = starts++;
        activeTasks++;
        peakTasks = Math.max(peakTasks, activeTasks);
        await new Promise((resolve) => setTimeout(resolve, 2));
        if (id % 10 === 0) {
          activeTasks--;
          throw new Error("submission timeout without receipt");
        }
        return { status: "pending", handle: { id }, receipt: { id: `remote-${id}` }, wakeAt: Date.now() + 3 };
      },
      poll({ handle }) {
        const { id } = handle as { id: number };
        const count = (checks.get(id) ?? 0) + 1;
        checks.set(id, count);
        if (id % 10 === 1) {
          activeTasks--;
          throw new Error("poll transport failed");
        }
        if (count < 10) return { status: "pending", handle, wakeAt: Date.now() + 3 };
        activeTasks--;
        return { status: "ready", handle };
      },
      async collect({ handle }) {
        const { id } = handle as { id: number };
        downloads++;
        peakDownloads = Math.max(peakDownloads, downloads);
        try {
          await new Promise((resolve) => setTimeout(resolve, 40));
          if (id % 10 === 2) throw new Error("download failed");
          return { status: "completed", result: `generated-${id}` };
        } finally { downloads--; }
      },
    } }],
  });
  const runtime = await createLocalRuntime({
    ...fixture,
    endpoints: [provider],
    producers: [
      { producer: producers.makePrompt, handler: () => ({ kind: "output", value: ("hello") }) },
      { producer: producers.requestText, handler: () => ({ kind: "need", constraints: { prompt: "hello" } }) },
    ],
  });
  const controller = new AbortController();
  let work: Promise<void> | undefined;
  try {
    const ids: string[] = [];
    for (let index = 0; index < 20; index++) {
      const id = `bld_20260906T120000000Z_${String(index).padStart(10, "0")}`;
      ids.push(id);
      const request = durableBuildRequest(directory, id, createGreetingBuildFixture({ targetOutputs: ["generated"] }));
      await runtime.build(request);
    }
    const deadline = setTimeout(() => controller.abort(), 20_000);
    try {
      work = runFixture(runtime, fixture.executionStore, { idlePollMs: 2, signal: controller.signal });
      while ((await fixture.executionStore.list()).length > 0 && !controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      controller.abort();
      await work;
    } finally { clearTimeout(deadline); }
    assert.equal((await fixture.executionStore.list()).length, 0, "every attempt must finish, including failures");
    assert.equal((await fixture.executionStore.listCapacity()).length, 0);
    assert.equal(starts, 20, "each Build submits once");
    assert.ok(peakTasks <= 8 && peakTasks > 1, `remote task concurrency: ${peakTasks}`);
    assert.ok(peakDownloads === 2, `download concurrency: ${peakDownloads}`);
    const results = new FileBuildResultRepository(join(directory, "results"));
    const manifests = await Promise.all(ids.map((id) => results.read(id)));
    assert.equal(manifests.filter((item) => item?.outcome === "complete").length, 14);
    assert.equal(manifests.filter((item) => item?.outcome === "failed").length, 6);
    assert.equal(manifests.filter((item) => item?.operations?.[0]?.receipt !== undefined).length, 18);
    assert.ok(manifests.filter((item) => item?.outcome === "failed").every((item) => item!.failure !== undefined));
  } finally {
    controller.abort();
    await work;
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});

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

test("local call logs survive cleanup and remain attributed across concurrent successful and failed Builds", { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-execution-logs-"));
  let calls = 0;
  const fixture = projectRuntimeFixture(directory);
  const runtime = await createLocalRuntime({
    ...fixture,
    endpoints: [defineEndpoint({ instance: "local-logs", pool: "local-logs", defaultConcurrency: 2,
      capabilities: [{ capability: capabilities.generation, returns: types.generated, lifecycle: "immediate", async handler(context) {
        const call = ++calls;
        for (let completed = 0; completed < 4; completed++) await context.reportProgress?.({ phase: "rendering", completed, total: 4 });
        await context.reportDiagnostic?.({ level: "info", message: `call ${call}` });
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (call === 2) throw new Error("render rejected");
        await context.reportProgress?.({ phase: "storing" });
        return { value: (`call ${call}`) };
      } }] })],
    producerPackages: [{ producers: [
      { producer: producers.makePrompt, handler: () => ({ kind: "output", value: ("hello") }) },
      { producer: producers.requestText, handler: () => ({ kind: "need", constraints: { prompt: "hello" } }) },
    ] }],
  });
  const ids = ["bld_20260913T120000000Z_0000000001", "bld_20260913T120000000Z_0000000002"];
  const controller = new AbortController();
  let work: Promise<void> | undefined;
  try {
    for (const id of ids) await runtime.build(durableBuildRequest(directory, id, createGreetingBuild({ targetOutputs: ["generated"] })));
    // The Worker records evidence with no CLI follower attached.
    work = runFixture(runtime, fixture.executionStore, { signal: controller.signal, idlePollMs: 2 });
    while (calls < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.ok((await runtime.logs!(ids[0]!, 30))!.records.length > 0);
    while ((await runtime.activity()).builds.length) await new Promise((resolve) => setTimeout(resolve, 2));
    const repository = new FileBuildResultRepository(join(directory, "results"));
    const seen = new Set<string>();
    for (const id of ids) {
      assert.equal(await runtime.inspect(id), undefined);
      assert.equal(await stat(join(directory, ".hypit/work", id)).then(() => true, () => false), false);
      const manifest = (await repository.read(id))!;
      assert.ok(manifest.executionLog);
      const log = await readExecutionLog((await repository.openFile(id, manifest.executionLog))!, 50);
      assert.equal(log.records.filter((record) => record.kind === "started").length, 1);
      assert.equal(log.records.filter((record) => record.kind === "phase" && record.phase === "rendering").length, 1);
      assert.ok(log.records.every((record) => record.endpoint === "local-logs"));
      const diagnostic = log.records.find((record) => record.kind === "diagnostic")!;
      assert.equal(diagnostic.kind, "diagnostic");
      if (diagnostic.kind !== "diagnostic") throw new Error("missing diagnostic");
      seen.add(diagnostic.message);
      assert.equal(manifest.outcome, diagnostic.message === "call 1" ? "complete" : "failed");
      assert.equal(log.records.at(-1)?.kind, manifest.outcome === "complete" ? "completed" : "failed");
      assert.equal(Object.keys(manifest.outputs).some((key) => key.includes("execution")), false);
    }
    assert.deepEqual([...seen].sort(), ["call 1", "call 2"]);
  } finally { controller.abort(); await work; await runtime.close(); await rm(directory, { recursive: true, force: true }); }
});

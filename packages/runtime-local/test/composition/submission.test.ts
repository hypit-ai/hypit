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

test("a project directory alias accepts its Source and stores a project-relative Result path", async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "hypit-local-project-alias-")));
  try {
    const directory = join(parent, "project");
    const alias = join(parent, "shortcut");
    await mkdir(directory);
    await writeFile(join(directory, "main.svml"), "source");
    await writeFile(join(parent, "outside.svs"), "outside");
    await symlink(directory, alias, "junction");
    await symlink(parent, join(directory, "escape"), "junction");
    const root = await resolveProjectRoot({ projectRoot: alias });
    const session = await new NodeFilesystemWorkspace({
      root,
      sourceAdapter: (unit) => ({ unit, frontend: "test.frontend@1" }),
    }).open(join(alias, "main.svml"));
    await assert.rejects(async () => await session.resolveSource(session.entry.unit, { from: "./escape/outside.svs", alias: "outside" }),
      { code: "SOURCE_OUTSIDE_ROOT" });
    const runtime = await createLocalRuntime(projectRuntimeFixture(directory));
    try {
      const request = durableBuildRequest(root, "bld_20260916T150000000Z_0000000001", createGreetingBuildFixture());
      await runtime.build({ ...request, catalog: { ...request.catalog, sourcePath: session.entry.unit.id } });
      const result = await new FileBuildResultRepository(join(directory, "results")).read(request.id);
      assert.equal(result?.sourceId, "main.svml");
    } finally { await runtime.close(); }
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test("a forward-only Build completes with no Core records or Producer work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-forward-only-"));
  const priorId = "bld_20260924T120000000Z_0000000001";
  const buildId = "bld_20260924T120000001Z_0000000001";
  try {
    await writeFile(join(directory, "main.svml"), "source");
    const repository = new FileBuildResultRepository(join(directory, "results"));
    const prior = await repository.create({
      id: priorId,
      sourceId: "main.svml",
      publication: { outputs: [{ name: "document", output: "document", target: true,
        type: types.document,
        source: { kind: "current-record", record: "record:document" } }] },
    });
    await prior.sync({
      records: [{ id: "record:document", type: types.document, value: ({ text: "ready" }) }],
      resources: { async open() { throw new Error("fixture has no files"); } },
    });
    await prior.finish({ outcome: "complete" });

    const template = createGreetingBuild();
    const empty = defineBuild({
      program: template.program,
      plan: { format: "hypit.plan@1", steps: [], goals: [] },
    });
    const runtime = await createLocalRuntime(projectRuntimeFixture(directory));
    try {
      await runtime.build({
        id: buildId,
        definition: empty,
        catalog: {
          sourcePath: join(directory, "main.svml"),
          publication: { outputs: [{
            name: "document",
            output: "forwarded-document",
            target: true,
            type: types.document,
            source: { kind: "historical-output", build: priorId, output: "document" },
          }] },
        },
        result: resultDestination(directory),
      });
      const completion = await finishClaimedBuild(runtime);
      assert.equal(completion.outcome, "complete");
      const result = await repository.read(buildId);
      assert.deepEqual(result?.targets, ["document"]);
      assert.deepEqual(result?.outputs.document, {
        type: types.document,
        value: { kind: "build-output", build: priorId, output: "document" },
      });
    } finally {
      await runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("Endpoint-declared credentials use the selected writable Store without a Provider switch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-auth-"));
  const values = new Map<string, CredentialValue>();
  const credentialStore: WritableCredentialStore = {
    owns(ref) { return ref.store === "memory"; },
    async resolve(ref) { return ref.store === "memory" ? values.get(ref.key) : undefined; },
    async put(ref, value) { values.set(ref.key, value); },
    async delete(ref) { return values.delete(ref.key); },
  };
  const endpoint = defineEndpoint({
    instance: "generation.auth-test",
    pool: "generation.auth-test",
    credentials: { apiKey: credentialRef("memory", "generation.api-key") },
    credentialInputs: { apiKey: { label: "Generation API key" } },
    capabilities: [{
      capability: capabilities.generation,
      returns: types.generated,
      lifecycle: "asynchronous",
      endpoint: {
        start() { throw new Error("unused"); },
        poll() { throw new Error("unused"); },
      },
    }],
  });
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      credentialStore,
      endpoints: [endpoint],
    });
    assert.deepEqual((await runtime.credentials("generation.auth-test")).map((item) => ({
      slot: item.slot, configured: item.configured, writable: item.writable,
    })), [{ slot: "apiKey", configured: false, writable: true }]);
    const stored = await runtime.putCredential("generation.auth-test", "apiKey", "secret");
    assert.equal(stored.configured, true);
    const removed = await runtime.deleteCredential("generation.auth-test", "apiKey");
    assert.equal(removed.deleted, true);
    assert.equal(removed.credential.configured, false);
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
  projectRuntimeFixture,
  publication,
  resultDestination,
  runFixture,
} from "./local-scenario.js";

test("a selected file is staged once and remains referenced in the produced structured Result value", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-bld_20260902T120000009Z_0000000001-"));
  const initial = createGreetingBuild();
  const bytes = new Uint8Array([4, 3, 2, 1]);
  const authoredAsset = {
    kind: "blob" as const,
    resource: "res_authored_input" as const,
    size: bytes.byteLength,
    mediaType: "image/png",
  };
  const program = {
    ...initial.program,
    records: initial.program.records.filter((record) => record.id !== "intent:root"),
  };
  const intent = initial.records.find((record) => record.id === "intent:root")!;
  const buildDefinition = defineBuild({
    program: link(program.closure, [...program.records, { ...intent, value: authoredAsset }]),
    plan: initial.plan,
  });
  let attachmentOpens = 0;
  let endpointCalls = 0;
  const components: { producers: ProducerPackage; refinements?: RefinementPackage } = {
    producers: [{
      producer: producers.makePrompt,
      handler: ({ inputs }) => ({ kind: "output", value: inputs.intent!.value }),
    }, {
      producer: producers.requestText,
      handler: ({ inputs }) => ({ kind: "need", constraints: { source: inputs.prompt!.value } }),
    }, {
      producer: producers.assemble,
      handler: ({ inputs }) => ({ kind: "output", value: ({ layers: [{ content: inputs.generated!.value }] }) }),
    }],
  };
  const endpoint = defineEndpoint({
    instance: "generation.bld_20260902T120000009Z_0000000001",
    pool: "generation.bld_20260902T120000009Z_0000000001",
    capabilities: [{
      lifecycle: "immediate",
      capability: capabilities.generation,
      returns: types.generated,
      handler: async ({ request, resources }) => {
        endpointCalls += 1;
        const source = (request.constraints as { readonly source: typeof authoredAsset }).source;
        assert.equal(await resources.has(source.resource), true);
        assert.deepEqual(await resources.get(source.resource), bytes);
        return { image: source };
      },
    }],
  });
  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(directory),
      producers: components.producers,
      endpoints: [endpoint],
    });
    await runtime.build({
      id: "bld_20260902T120000009Z_0000000001",
      definition: buildDefinition,
      authoring: {
        sourcePath: join(directory, "main.svml"),
        publication: { outputs: [{ name: "final.document", output: "document", target: true,
          type: types.document,
          record: "document:root" }] },
      },
      attachments: [{
        blob: authoredAsset,
        async open() {
          attachmentOpens += 1;
          return (async function* () { yield bytes; })();
        },
      }],
      result: resultDestination(directory),
    });
    assert.equal(attachmentOpens, 1);
    const work = new FileResourceStore(join(directory, ".hypit", "work", "bld_20260902T120000009Z_0000000001"));
    assert.equal(await work.has(authoredAsset.resource), true);

    const completed = await runtime.workOnce();
    assert(completed !== undefined && "outcome" in completed);
    assert.equal(completed.outcome, "complete");
    assert.equal(endpointCalls, 1);
    assert.equal(attachmentOpens, 1);
    assert.equal(await work.has(authoredAsset.resource), false);
    const results = new FileBuildResultRepository(join(directory, "results"));
    const resolved = (await results.resolve("bld_20260902T120000009Z_0000000001", "final.document"))!;
    assert.equal(resolved.value.kind, "value");
    if (resolved.value.kind !== "value") throw new Error("expected value document");
    assert.deepEqual(resolved.value.document.resources.map((binding) => binding.file), [{
      kind: "build-file", path: "files/file-0001.png", size: bytes.length, mediaType: authoredAsset.mediaType,
    }]);
    const resultDirectory = join(directory, "results", "2026-09-02", "bld_20260902T120000009Z_0000000001");
    assert.deepEqual((await readdir(resultDirectory)).sort(), ["execution.jsonl", "files", "result.json", "values"]);
    assert.deepEqual(await readFile(join(resultDirectory, "files", "file-0001.png")), Buffer.from(bytes));
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

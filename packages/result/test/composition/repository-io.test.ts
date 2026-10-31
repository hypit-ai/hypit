import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { buildResultDirectory, FileBuildResult, FileBuildResultStore } from "@hypit/result/runtime-storage/node";
import { isBlobRef } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

import {
  structuredType,
  resultIntent,
  videoType,
} from "./repository-scenario.js";

test("finished Output readers expose only that Output's retained Resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-range-"));
  const build = "bld_20260902T100000009Z_0000000001";
  try {
    const bytes = new TextEncoder().encode("abcdefghij");
    const source: BlobRef = { kind: "blob", resource: "res_source_video", size: bytes.byteLength, mediaType: "video/mp4" };
    const writer = await FileBuildResult.create(root, {
      id: build, sourcePath: "main.svml", targets: ["video"],
      intent: resultIntent([
        { name: "video", record: "record:video" },
        { name: "video-copy", record: "record:video" },
      ]),
    });
    await writer.sync({
      records: [{ id: "record:video", type: videoType, value: source }],
      resources: { async open(blob) {
        assert.equal(blob.resource, source.resource);
        return (async function* () { yield bytes; })();
      } },
    });
    const repository = new FileBuildResultStore(root);
    assert.equal(await repository.resolve(build, "video"), undefined, "drafts stay outside history");
    await writer.finish({ outcome: "complete", executionLog: (async function* () {
      yield new TextEncoder().encode("log\n");
    })() });
    const resolved = await repository.resolve(build, "video");
    assert.ok(resolved !== undefined && isBlobRef(resolved.value));
    if (resolved === undefined || !isBlobRef(resolved.value)) throw new Error("expected retained Blob");
    const stream = await resolved.openResource(resolved.value, { start: 3, endExclusive: 7 });
    assert.notEqual(stream, undefined);
    const chunks: number[] = [];
    for await (const chunk of stream!) chunks.push(...chunk);
    assert.equal(new TextDecoder().decode(Uint8Array.from(chunks)), "defg");
    assert.equal(await resolved.openResource({ ...resolved.value, resource: "res_forged" }), undefined);
    const sibling = await repository.resolve(build, "video-copy");
    assert.ok(sibling !== undefined && isBlobRef(sibling.value));
    if (sibling === undefined) throw new Error("expected sibling retained Blob");
    assert.equal(await sibling.openResource(resolved.value), undefined,
      "a BlobRef resolved for one Output is not authority over a sibling Output");
    assert.notEqual(await repository.openExecutionLog(build), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem decodes Result and writer data before exposing it", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-decode-"));
  const malformed = "bld_20260902T100000010Z_0000000001";
  const unfinished = "bld_20260902T100000011Z_0000000001";
  try {
    const directory = buildResultDirectory(root, malformed);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      sourcePath: "main.svml",
      targets: ["video"],
      outputs: {
        video: {
          type: videoType,
          value: { kind: "build-file", path: "../outside.mp4", size: 1, mediaType: "video/mp4" },
        },
      },
    }));
    const repository = new FileBuildResultStore(root);
    await assert.rejects(repository.read(malformed), /outputs\["video"\]\.value\.path is not a Result-relative path/u);

    const writer = await repository.create({
      id: unfinished,
      sourcePath: "main.svml",
      targets: [],
      intent: resultIntent([]),
    });
    await writeFile(join(buildResultDirectory(root, unfinished), ".writer.json"), JSON.stringify({
      resources: null,
      values: {},
      intent: { outputs: [] },
    }));
    await assert.rejects(writer.sync({
      records: [],
      resources: { async open() { return undefined; } },
    }), /\.writer\.json\.resources must be an object/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reserved-looking domain objects remain ordinary domain data", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-json-reference-"));
  const id = "bld_20260902T100000000Z_0000000001";
  try {
    const directory = buildResultDirectory(root, id);
    await mkdir(join(directory, "values"), { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      sourcePath: "main.svml",
      targets: ["value"],
      outcome: "complete",
      finishedAt: 1,
      outputs: { value: { type: videoType, value: { kind: "value", path: "values/value-0001.json" } } },
    }));
    await writeFile(join(directory, "values", "value-0001.json"), JSON.stringify({
      format: "hypit.result-value@1",
      value: { nested: { kind: "value", path: "domain-authored" } },
      resources: [],
    }));
    const resolved = await new FileBuildResultStore(root).resolve(id, "value");
    assert.deepEqual(resolved?.value, {
      nested: { kind: "value", path: "domain-authored" },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reading a value-document Output manifest does not open its document", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-describe-"));
  const id = "bld_20260902T100000020Z_0000000001";
  try {
    const directory = buildResultDirectory(root, id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      sourcePath: "main.svml",
      targets: ["take"],
      outcome: "complete",
      finishedAt: 1,
      outputs: { take: { type: structuredType, value: { kind: "value", path: "values/missing.json" } } },
    }));
    const repository = new FileBuildResultStore(root);
    const manifest = await repository.read(id);
    assert.equal(manifest?.outputs.take?.representation, "structured");
    await assert.rejects(repository.resolve(id, "take"), /missing\.json/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

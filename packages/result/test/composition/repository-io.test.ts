import assert from "node:assert/strict";
import { mkdir, mkdtemp, open, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { buildResultDirectory, FileBuildResult, FileBuildResultRepository, syncBuildResultOutputs } from "@hypit/result/node";
import type { BlobRef } from "@hypit/protocol";

import {
  acceptedRecords,
  compositeType,
  publication,
  videoType,
} from "./repository-scenario.js";

test("filesystem repository streams one normalized byte range", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-range-"));
  const build = "bld_20260902T100000009Z_0000000001";
  try {
    const directory = buildResultDirectory(root, build);
    await mkdir(join(directory, "files"), { recursive: true });
    const bytes = new TextEncoder().encode("abcdefghij");
    await writeFile(join(directory, "files", "video.mp4"), bytes);
    const repository = new FileBuildResultRepository(root);
    const stream = await repository.openFile(build, {
      kind: "build-file",
      path: "files/video.mp4",
      size: bytes.byteLength,
      mediaType: "video/mp4",
    }, { start: 3, endExclusive: 7 });
    assert.notEqual(stream, undefined);
    const chunks: number[] = [];
    for await (const chunk of stream!) chunks.push(...chunk);
    assert.equal(new TextDecoder().decode(Uint8Array.from(chunks)), "defg");
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
      source: { id: "main.svml" },
      targets: ["video"],
      outputs: {
        video: {
          type: videoType,
          value: { kind: "build-file", path: "../outside.mp4", size: 1, mediaType: "video/mp4" },
        },
      },
    }));
    const repository = new FileBuildResultRepository(root);
    await assert.rejects(repository.read(malformed), /outputs\["video"\]\.value\.path is not a Result-relative path/u);

    const writer = await repository.create({
      id: unfinished,
      source: { id: "main.svml" },
      publication: publication([]),
    });
    await writeFile(join(buildResultDirectory(root, unfinished), ".writer.json"), JSON.stringify({
      resources: null,
      values: {},
      publication: { outputs: [] },
    }));
    await assert.rejects(writer.sync({
      records: [],
      resources: { async open() { return undefined; } },
    }), /\.writer\.json\.resources must be an object/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reserved-looking domain objects remain ordinary Composite data", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-json-reference-"));
  const id = "bld_20260902T100000000Z_0000000001";
  try {
    const directory = buildResultDirectory(root, id);
    await mkdir(join(directory, "values"), { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      source: { id: "main.svml" },
      targets: ["value"],
      outcome: "complete",
      finishedAt: 1,
      outputs: { value: { type: videoType, value: { kind: "value", path: "values/value-0001.json" } } },
    }));
    await writeFile(join(directory, "values", "value-0001.json"), JSON.stringify({
      format: "hypit.result-value@1",
      value: { nested: { kind: "build-output", build: id, output: "value" } },
      resources: [],
    }));
    const resolved = await new FileBuildResultRepository(root).resolve(id, "value");
    assert.equal(resolved?.value.kind, "value");
    if (resolved?.value.kind !== "value") throw new Error("expected Composite Result value");
    assert.deepEqual(resolved.value.document.value, {
      nested: { kind: "build-output", build: id, output: "value" },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("describing a Composite Output reads only its manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-describe-"));
  const id = "bld_20260902T100000020Z_0000000001";
  try {
    const directory = buildResultDirectory(root, id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "result.json"), JSON.stringify({
      format: "hypit.build-result@1",
      source: { id: "main.svml" },
      targets: ["take"],
      outcome: "complete",
      finishedAt: 1,
      outputs: { take: { type: compositeType, value: { kind: "value", path: "values/missing.json" } } },
    }));
    const repository = new FileBuildResultRepository(root);
    const description = await repository.describeOutput(id, "take");
    assert.equal(description?.representation, "value-document");
    await assert.rejects(repository.resolve(id, "take"), /missing\.json/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

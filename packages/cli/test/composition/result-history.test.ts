import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { commandHint } from "../../src/command-hint.js";
import test from "node:test";

import {
  FileBuildResult,
  FileBuildResultStore,
} from "@hypit/result/runtime-storage/node";
import type { CapabilityRef, TypeRef, TypedRecord } from "@hypit/protocol";

import type { CliDistribution } from "../../src/distribution.js";
import { cliDistribution } from "../distribution-scenario.js";
import { runCli } from "../../src/main.js";
import {
  completedRecords,
  fixture,
  generationCapability,
  humanCommand,
  jsonCommand,
  resultIntent,
  resultDistribution,
  valueType,
} from "./build-result-scenario.js";

test("builds, history, inspect and result export read project Build Results without opening a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-results-"));
  try {
    await fixture(root);
    await writeFile(join(root, ".hypit", "runtime"), "missing-runtime.json\n", "utf8");
    const builds = await jsonCommand(["builds"], root) as {
      readonly builds: readonly {
        readonly id: string;
        readonly source: string;
        readonly outcome: string;
        readonly outputCount: number;
      }[];
    };
    assert.equal(builds.builds.length, 1);
    assert.equal(builds.builds[0]?.id, "bld_20260902T110000000Z_0000000001");
    assert.equal(builds.builds[0]?.outcome, "complete");
    assert.equal(builds.builds[0]?.outputCount, 1);
    assert.equal(builds.builds[0]?.source, "main.svml");
    assert.equal("outputs" in builds.builds[0]!, false);

    const history = await jsonCommand(["history", "stage.value"], root) as {
      readonly entries: readonly { readonly build: string; readonly source: string; readonly output: { readonly name: string } }[];
    };
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0]?.build, "bld_20260902T110000000Z_0000000001");
    assert.equal(history.entries[0]?.source, "main.svml");
    assert.equal(history.entries[0]?.output.name, "stage.value");

    const inspected = await jsonCommand(["inspect", "bld_20260902T110000000Z_0000000001"], root) as {
      readonly build: { readonly id: string };
    };
    assert.equal(inspected.build.id, "bld_20260902T110000000Z_0000000001");

    const humanHistory = await humanCommand(["history", "stage.value"], root);
    assert.doesNotMatch(humanHistory, /example\.result|scalar/u);

    const humanInspect = await humanCommand(["inspect", "bld_20260902T110000000Z_0000000001"], root);
    assert.match(humanInspect, /Output\s+stage\.value/u);
    assert.match(humanInspect, /Source\s+main\.svml/u);
    assert.doesNotMatch(humanInspect, /example\.result|scalar/u);

    const destination = join(root, "exported.json");
    const exported = await jsonCommand([
      "result", "export", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", destination,
    ], root);
    assert.deepEqual(exported, {
      format: "hypit.cli-result-export@1",
      build: "bld_20260902T110000000Z_0000000001",
      output: "stage.value",
      type: "example.result@1#Value",
      representation: "inline",
      path: destination,
    });
    assert.equal(await readFile(destination, "utf8"), "\"ready\"\n");

    const humanDestination = join(root, "human-exported.json");
    const humanGet = await humanCommand([
      "result", "export", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", humanDestination,
    ], root);
    assert.match(humanGet, /Exported stage\.value → human-exported\.json/u);
    assert.doesNotMatch(humanGet, /\b(?:Type|Kind|Build)\b|example\.result|scalar/u);
    await assert.rejects(
      jsonCommand(["result", "export", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", destination], root),
      /Export destination .* already exists/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("history scans older pages for matches and compares project-relative source paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-history-"));
  try {
    await writeFile(join(root, "main.svml"), "source", "utf8");
    await fixture(root);
    const repository = new FileBuildResultStore(join(root, ".hypit", "results"));
    for (const id of [
      "bld_20260902T110000001Z_0000000001",
      "bld_20260902T110000002Z_0000000001",
    ]) {
      const writer = await repository.create({
        id,
        sourcePath: "other.svml",
        targets: [],
        intent: resultIntent([]),
      });
      await writer.finish({ outcome: "failed", failure: "fixture without the requested Output" });
    }

    const history = await jsonCommand([
      "history", "stage.value", "--source", join(root, "main.svml"), "--limit", "1",
    ], root) as {
      readonly source: string;
      readonly entries: readonly { readonly build: string }[];
    };
    assert.equal(history.source, "main.svml");
    assert.deepEqual(history.entries.map((item) => item.build), ["bld_20260902T110000000Z_0000000001"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("result export writes Blob bytes and uses the Type owner's structured author format", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-result-export-"));
  const build = "bld_20260902T110000010Z_0000000001";
  const videoType = { module: { name: "example.media", version: "1" }, name: "Video" } satisfies TypeRef;
  const structuredType = { module: { name: "example.speech", version: "1" }, name: "StructuredValue" } satisfies TypeRef;
  const bytes = new TextEncoder().encode("video bytes");
  const video = {
    kind: "blob",
    resource: "res_video",
    size: bytes.byteLength,
    mediaType: "video/mp4",
  } as const;
  try {
    const result = await FileBuildResult.create(join(root, ".hypit", "results"), {
      id: build,
      sourcePath: join(root, "main.svml"),
      targets: ["final.video"],
      intent: resultIntent([
        { name: "final.video", record: "record:video" },
        { name: "final.take", record: "record:take" },
      ]),
    });
    await result.sync({
      records: [
          { id: "record:video", type: videoType, value: video },
          {
            id: "record:take",
            type: structuredType,
            value: ({ words: ["hello"], media: { artifact: video } }),
          },
        ],
      resources: {
        async open() { return (async function* () { yield bytes; })(); },
      },
    });
    await result.finish({ outcome: "complete" });

    const inspected = await jsonCommand([
      "inspect", build, "--output", "final.take",
    ], root) as {
      readonly build: { readonly outputs: readonly [{ readonly name: string; readonly representation: string }] };
    };
    assert.equal(inspected.build.outputs[0].name, "final.take");
    assert.equal(inspected.build.outputs[0].representation, "value-document");
    assert.equal("value" in inspected.build.outputs[0], false);
    assert.equal("path" in inspected.build.outputs[0], false);

    const resourceDestination = join(root, "output", "final.mp4");
    const resource = await jsonCommand([
      "result", "export", build, "--output", "final.video", "--to", resourceDestination,
    ], root) as { readonly representation: string; readonly build: string; readonly output: string };
    assert.equal(resource.representation, "file");
    assert.equal(resource.build, build);
    assert.equal(resource.output, "final.video");
    assert.equal(new TextDecoder().decode(await readFile(resourceDestination)), "video bytes");

    const valueDocumentDestination = join(root, "output", "final-take.json");
    const valueDocument = await jsonCommand([
      "result", "export", build, "--output", "final.take", "--to", valueDocumentDestination,
    ], root) as { readonly representation: string; readonly path: string };
    assert.equal(valueDocument.representation, "structured");
    assert.equal(valueDocument.path, valueDocumentDestination);
    assert.equal((await stat(valueDocumentDestination)).isFile(), true);
    assert.deepEqual(JSON.parse(await readFile(valueDocumentDestination, "utf8")), { words: ["hello"] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("result export requires an exact retained Output name and an explicit destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-result-export-options-"));
  try {
    const silent = { write() {} };
    await assert.rejects(
      runCli(["result", "export", "bld_20260902T110000000Z_0000000001", "--project", root], silent, resultDistribution()),
      /result export requires --output/u,
    );
    await assert.rejects(
      runCli([
        "result", "export", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--project", root,
      ], silent, resultDistribution()),
      /result export requires --to/u,
    );
    await assert.rejects(
      runCli(["history", "--source", join(root, "main.svml"), "--project", root], silent,
        resultDistribution()),
      /history requires one exact Output name/u,
    );
    await assert.rejects(
      runCli(["history", "stage.value", "--pin", "--project", root], silent, resultDistribution()),
      /unknown option --pin/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("history continuation keeps the same project and Source query", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit cli pagination "));
  try {
    const older = "bld_20260902T110000000Z_0000000001";
    const newer = "bld_20260902T110000002Z_0000000001";
    await writeFile(join(root, "selected source.svml"), "source", "utf8");
    await fixture(root, older, "selected source.svml");
    await fixture(root, "bld_20260902T110000001Z_0000000001", "unrelated.svml");
    await fixture(root, newer, "selected source.svml");
    const args = ["history", "stage.value", "--source", join(root, "selected source.svml"), "--limit", "1"];
    const human = await humanCommand(args, root);
    assert.match(human, /Repeat this command with --before (\S+), keeping the other options/u);
    const cursor = /--before (\S+),/u.exec(human)![1]!;
    const next = await jsonCommand([...args, "--before", cursor], root) as { entries: { build: string }[] };
    assert.deepEqual(next.entries.map((item) => item.build), [older]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("history does not reconstruct the address of a deleted Source", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hypit-history-alias-"));
  try {
    const root = join(parent, "project");
    const alias = join(parent, "shortcut");
    await mkdir(join(root, "chapter"), { recursive: true });
    await writeFile(join(root, "chapter", "main.svml"), "source");
    await symlink(root, alias, "junction");
    const id = "bld_20260902T110000000Z_0000000001";
    await fixture(root, id, "chapter/main.svml");
    await rm(join(root, "chapter"), { recursive: true });
    await assert.rejects(
      jsonCommand(["history", "stage.value", "--source", join(alias, "chapter", "main.svml")], alias),
      /ENOENT/u,
    );
  } finally { await rm(parent, { recursive: true, force: true }); }
});

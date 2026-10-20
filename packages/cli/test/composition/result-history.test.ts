import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { commandHint } from "../../src/command-hint.js";
import test from "node:test";

import {
  fileReferenceIdentity,
  FileBuildResult,
  FileBuildResultRepository,
  ownedFileReference,
} from "@hypit/result/node";
import { ModulePackageRegistry, Compiler } from "@hypit/compiler";
import { AuthorFrontendRegistry, sealGraphFragment } from "@hypit/author";
import { createMarkupAuthorFrontend, MarkupSurfaceRegistry } from "@hypit/markup";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, TypedRecord } from "@hypit/protocol";
import { runMarkupFrontend } from "@hypit/markup/run";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";

import type { CliDistribution } from "../../src/distribution.js";
import { cliDistribution } from "../distribution-scenario.js";
import { createCatalogDescriptor } from "../../src/build-planning.js";
import { runCli } from "../../src/main.js";
import { loadRunFile, resolveBuildResultValue } from "../../src/run-file.js";
import type { BuildResultValueRepository } from "../../src/run-file.js";

import {
  completedRecords,
  fixture,
  generationCapability,
  humanCommand,
  jsonCommand,
  publication,
  resultDistribution,
  valueType,
} from "./build-result-scenario.js";

test("builds, history, inspect and get read project Build Results without opening a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-results-"));
  try {
    await fixture(root);
    await writeFile(join(root, ".hypit", "runtime"), "missing-runtime.json\n", "utf8");
    const builds = await jsonCommand(["builds"], root) as {
      readonly builds: readonly {
        readonly id: string;
        readonly title?: string;
        readonly outcome: string;
        readonly outputCount: number;
      }[];
    };
    assert.equal(builds.builds.length, 1);
    assert.equal(builds.builds[0]?.id, "bld_20260902T110000000Z_0000000001");
    assert.equal(builds.builds[0]?.title, "episode-stage");
    assert.equal(builds.builds[0]?.outcome, "complete");
    assert.equal(builds.builds[0]?.outputCount, 1);
    assert.equal("source" in builds.builds[0]!, false);
    assert.equal("outputs" in builds.builds[0]!, false);

    const history = await jsonCommand(["history", "stage.value"], root) as {
      readonly entries: readonly { readonly build: string; readonly output: { readonly name: string } }[];
    };
    assert.equal(history.entries.length, 1);
    assert.equal(history.entries[0]?.build, "bld_20260902T110000000Z_0000000001");
    assert.equal(history.entries[0]?.output.name, "stage.value");

    const inspected = await jsonCommand(["inspect", "bld_20260902T110000000Z_0000000001"], root) as {
      readonly build: { readonly id: string; readonly title?: string };
    };
    assert.equal(inspected.build.id, "bld_20260902T110000000Z_0000000001");
    assert.equal(inspected.build.title, "episode-stage");

    const humanHistory = await humanCommand(["history", "stage.value"], root);
    assert.match(humanHistory, /episode-stage/u);
    assert.doesNotMatch(humanHistory, /example\.result|scalar/u);

    const humanInspect = await humanCommand(["inspect", "bld_20260902T110000000Z_0000000001"], root);
    assert.match(humanInspect, /Target\s+stage\.value/u);
    assert.doesNotMatch(humanInspect, /example\.result|scalar/u);

    const destination = join(root, "exported.json");
    const exported = await jsonCommand([
      "get", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", destination,
    ], root);
    assert.deepEqual(exported, {
      format: "hypit.cli-get@1",
      build: "bld_20260902T110000000Z_0000000001",
      output: "stage.value",
      type: "example.result@1/Value",
      representation: "inline",
      path: destination,
    });
    assert.equal(await readFile(destination, "utf8"), "\"ready\"\n");

    const humanDestination = join(root, "human-exported.json");
    const humanGet = await humanCommand([
      "get", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", humanDestination,
    ], root);
    assert.match(humanGet, /Exported stage\.value → human-exported\.json/u);
    assert.doesNotMatch(humanGet, /\b(?:Type|Kind|Build)\b|example\.result|scalar/u);
    await assert.rejects(
      jsonCommand(["get", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--to", destination], root),
      /Export destination .* already exists/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("history scans older pages for matches and compares project-relative source paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-history-"));
  try {
    await fixture(root);
    const repository = new FileBuildResultRepository(join(root, ".hypit", "results"));
    for (const id of [
      "bld_20260902T110000001Z_0000000001",
      "bld_20260902T110000002Z_0000000001",
    ]) {
      const writer = await repository.create({
        id,
        source: { id: "other.svml" },
        publication: publication([]),
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

test("get exports Resource bytes and a self-contained Composite directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-get-"));
  const build = "bld_20260902T110000010Z_0000000001";
  const videoType = { module: { name: "example.media", version: "1" }, name: "Video" } satisfies TypeRef;
  const compositeType = { module: { name: "example.speech", version: "1" }, name: "CompositeValue" } satisfies TypeRef;
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
      source: { id: join(root, "main.svml") },
      publication: publication([
        { name: "final.video", output: "logical:video", type: videoType },
        { name: "final.take", output: "logical:take", type: compositeType },
      ], ["final.video"]),
    });
    await result.sync({
      records: [
          { id: "record:video", type: videoType, value: video },
          {
            id: "record:take",
            type: compositeType,
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
      "get", build, "--output", "final.video", "--to", resourceDestination,
    ], root) as { readonly representation: string; readonly build: string; readonly output: string };
    assert.equal(resource.representation, "file");
    assert.equal(resource.build, build);
    assert.equal(resource.output, "final.video");
    assert.equal(new TextDecoder().decode(await readFile(resourceDestination)), "video bytes");

    const compositeDestination = join(root, "output", "final-take");
    const composite = await jsonCommand([
      "get", build, "--output", "final.take", "--to", compositeDestination,
    ], root) as { readonly representation: string; readonly path: string };
    assert.equal(composite.representation, "value-document");
    assert.equal(composite.path, compositeDestination);
    assert.equal((await stat(compositeDestination)).isDirectory(), true);
    const document = JSON.parse(await readFile(join(compositeDestination, "value.json"), "utf8")) as {
      readonly format: string;
      readonly value: { readonly words: readonly string[]; readonly media: { readonly artifact: null } };
      readonly resources: readonly [{ readonly file: { readonly path: string } }];
    };
    assert.equal(document.format, "hypit.result-value@1");
    assert.deepEqual(document.value.words, ["hello"]);
    assert.equal(document.value.media.artifact, null);
    assert.equal(
      new TextDecoder().decode(await readFile(join(compositeDestination, document.resources[0].file.path))),
      "video bytes",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("get requires an exact Output name and an explicit destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-get-options-"));
  try {
    const silent = { write() {} };
    await assert.rejects(
      runCli(["get", "bld_20260902T110000000Z_0000000001", "--project", root], silent, resultDistribution()),
      /get requires --output/u,
    );
    await assert.rejects(
      runCli([
        "get", "bld_20260902T110000000Z_0000000001", "--output", "stage.value", "--project", root,
      ], silent, resultDistribution()),
      /get requires --to/u,
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

test("result edit changes only the exact project Result presentation without opening a Runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-cli-result-edit-"));
  try {
    await fixture(root);
    const edited = await jsonCommand([
      "result", "edit", "bld_20260902T110000000Z_0000000001",
      "--title", "Episode 12 B-roll",
      "--note", "Use the close-up for the opening beat.",
      "--highlight", "stage.value",
      "--highlight", "stage.value",
    ], root) as {
      readonly build: string;
      readonly title: string;
      readonly note: string;
      readonly highlightedOutputs: readonly string[];
    };
    assert.deepEqual(edited, {
      format: "hypit.cli-result-edit@1",
      build: "bld_20260902T110000000Z_0000000001",
      title: "Episode 12 B-roll",
      note: "Use the close-up for the opening beat.",
      highlightedOutputCount: 1,
      highlightedOutputs: ["stage.value"],
    });

    const repository = new FileBuildResultRepository(join(root, ".hypit", "results"));
    const stored = await repository.read("bld_20260902T110000000Z_0000000001");
    assert.equal(stored?.title, "Episode 12 B-roll");
    assert.equal(stored?.note, "Use the close-up for the opening beat.");
    assert.deepEqual(stored?.highlightedOutputs, ["stage.value"]);

    const cleared = await jsonCommand([
      "result", "edit", "bld_20260902T110000000Z_0000000001", "--clear-title", "--clear-note", "--clear-highlights",
    ], root) as {
      readonly title: null;
      readonly note: null;
      readonly highlightedOutputCount: number;
      readonly highlightedOutputs: readonly string[];
    };
    assert.equal(cleared.title, null);
    assert.equal(cleared.note, null);
    assert.equal(cleared.highlightedOutputCount, 0);
    assert.deepEqual(cleared.highlightedOutputs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("history continuation keeps the same project and Source query", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit cli pagination "));
  try {
    const older = "bld_20260902T110000000Z_0000000001";
    const newer = "bld_20260902T110000002Z_0000000001";
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

test("history through a directory alias still finds a Source after its directory is removed", async () => {
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
    const history = await jsonCommand(["history", "stage.value", "--source", join(alias, "chapter", "main.svml")], alias) as {
      source: string; entries: { build: string }[];
    };
    assert.equal(history.source, join("chapter", "main.svml"));
    assert.deepEqual(history.entries.map((entry) => entry.build), [id]);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RunCompiler } from "@hypit/compiler";
import { isBlobRef } from "@hypit/protocol";
import { RunFragmentRegistry, RunFrontendRegistry } from "@hypit/run";
import { runMarkupFrontend } from "@hypit/markup/run";

import { assetCompiler, readAttachment } from "../compiler-scenario.js";

test("source assets become graph values and a Host transfer bundle without closure metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-source-assets-"));
  const file = join(root, "main.svml");
  const asset = join(root, "reference.bin");
  await writeFile(file, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="reference" src="./reference.bin"/>
  </svml>`, "utf8");
  await writeFile(asset, new Uint8Array([1, 2, 3, 4]));

  const first = await assetCompiler({ root }).compileEntry(file);
  const attachment = first.attachments[0];
  assert.deepEqual(await readAttachment(attachment), new Uint8Array([1, 2, 3, 4]));
  const firstValue = first.program.records[0]?.value;
  assert.equal(firstValue === undefined ? false : isBlobRef(firstValue), true);
  assert.equal(firstValue !== undefined && isBlobRef(firstValue) ? firstValue.resource : undefined, attachment?.blob.resource);
  await writeFile(asset, new Uint8Array([9, 8, 7]));
  const second = await assetCompiler({ root }).compileEntry(file);
  assert.notEqual(second.attachments[0]?.blob.resource, attachment?.blob.resource);
});

test("an installed package declaration can contribute embedded bytes without an author file or network", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-embedded-assets-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <asset:Asset id="embedded" src="package:example.asset-lab/embedded.bin"/>
  </svml>`, "utf8");

  const compiled = await assetCompiler({ root }).compileEntry(file);
  const attachment = compiled.attachments[0];
  assert.deepEqual(await readAttachment(attachment), new Uint8Array([8, 6, 7, 5, 3, 0, 9]));
  const compiledValue = compiled.program.records[0]?.value;
  assert.equal(compiledValue === undefined ? false : isBlobRef(compiledValue), true);
  assert.equal(compiledValue !== undefined && isBlobRef(compiledValue)
    ? compiledValue.resource
    : undefined, attachment?.blob.resource);
});

test("Run compilation retains embedded Author attachments for later Runtime staging", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-run-author-attachments-"));
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "build.svrun");
  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="asset" from="example.asset-lab@1"/>
    <import as="lab" from="example.compiler-lab@1"/>
    <asset:Asset id="embedded" src="package:example.asset-lab/embedded.bin"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <target output="hello.result"/>
  </svrun>`, "utf8");

  const authorCompiler = assetCompiler({ root });
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const runCompiler = new RunCompiler({
    authorCompiler,
    frontends,
    fragments: new RunFragmentRegistry(),
  });
  const compiled = await runCompiler.compileEntry(runFile);
  assert.deepEqual(compiled.attachments.map((item) => item.blob), compiled.author.attachments.map((item) => item.blob));
  assert.deepEqual(await readAttachment(compiled.attachments[0]), new Uint8Array([8, 6, 7, 5, 3, 0, 9]));
});

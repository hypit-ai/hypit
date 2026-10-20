import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SourceHeaderError } from "@hypit/source/text";

import { compiler } from "../compiler-scenario.js";

test("Node Compiler discovers real imports and emits a named public Author Graph export", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-compiler-node-"));
  const file = join(root, "main.svml");
  await writeFile(file, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");

  let discoveries = 0;
  const compiled = await compiler(root, [], () => { discoveries += 1; }).compileEntry(file);
  assert.equal(compiled.exports[0]?.name, "hello.result");
  assert.equal(compiled.graph.outputs.length, 1);
  assert.equal(discoveries, 1, "the frozen Import Prologue must not execute Frontend discovery twice");

});

test("the self-described text adapter requires a Header and ignores the filename suffix", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-self-described-source-"));
  const text = `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`;
  const svml = join(root, "main.svml");
  const arbitrary = join(root, "main.anything");
  await writeFile(svml, text, "utf8");
  await writeFile(arbitrary, text, "utf8");
  const first = await compiler(root).compileEntry(svml);
  const second = await compiler(root).compileEntry(arbitrary);
  assert.equal(first.exports[0]?.name, "hello.result");
  assert.equal(second.exports[0]?.name, "hello.result");

  const missing = join(root, "missing.svml");
  await writeFile(missing, "<svml/>", "utf8");
  await assert.rejects(
    compiler(root).compileEntry(missing),
    (error: unknown) => error instanceof SourceHeaderError && error.code === "SOURCE_HEADER_MISSING",
  );
});

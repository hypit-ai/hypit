import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BuildCompiler } from "@hypit/compiler";
import { compiler } from "../compiler-scenario.js";

test("an Author Source and explicit targets compile into one Build", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-direct-build-"));
  const authorFile = join(root, "main.svml");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup@1\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab@1\"/>",
    "  <lab:Result id=\"hello\"/>",
    "</svml>",
  ].join("\n"), "utf8");

  const buildCompiler = new BuildCompiler({
    authorCompiler: compiler(root),
  });
  const compiled = await buildCompiler.compileAuthorEntry(authorFile, {
    targets: ["hello.result"],
  });
  const prepared = buildCompiler.prepareBuild(compiled);

  assert.equal(compiled.authorSource, await realpath(authorFile));
  assert.equal(compiled.selection.targets.length, 1);
  assert.equal(prepared.definition.plan.steps.length, 1);
  assert.deepEqual(prepared.targets.map((target) => target.name), ["hello.result"]);
  assert.deepEqual(prepared.result.outputs.map((output) => output.name), ["hello.result"]);
});

test("Result intent keeps reachable package Outputs without retaining derived or unreachable outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-intent-"));
  const authorFile = join(root, "main.svml");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup@1\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab@1\"/>",
    "  <lab:Result id=\"material\"/>",
    "  <lab:Result id=\"unused\"/>",
    "  <lab:Forward id=\"final\" source={material.result}/>",
    "</svml>",
  ].join("\n"), "utf8");

  const buildCompiler = new BuildCompiler({
    authorCompiler: compiler(root),
  });
  const prepared = buildCompiler.prepareBuild(await buildCompiler.compileAuthorEntry(authorFile, {
    targets: ["final.result"],
  }));

  assert.equal(prepared.definition.plan.steps.length, 2);
  assert.deepEqual(prepared.targets.map((target) => target.name), ["final.result"]);
  assert.deepEqual(prepared.result.outputs.map((output) => output.name), ["material.result"]);
});

import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BuildCompiler } from "@hypit/generation-authoring/compiler";
import { compiler } from "../compiler-scenario.js";

test("an Author Source and explicit targets compile into one Build", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-direct-build-"));
  const authorFile = join(root, "main.svml");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab\"/>",
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
  assert.deepEqual(prepared.publication.outputs.map((output) => output.name), ["hello.result"]);
});

test("publication keeps reachable package products without publishing derived or unreachable outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-result-intent-"));
  const authorFile = join(root, "main.svml");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab\"/>",
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
  assert.deepEqual(prepared.publication.outputs.map((output) => output.name), ["material.result"]);
});

test("an execution view observes extra logical outputs without creating Targets or publications", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-observation-build-"));
  const authorFile = join(root, "main.svml");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab\"/>",
    "  <lab:Result id=\"main\"/>",
    "  <lab:Result id=\"projection\"/>",
    "</svml>",
  ].join("\n"), "utf8");

  const buildCompiler = new BuildCompiler({ authorCompiler: compiler(root) });
  const compiled = await buildCompiler.compileAuthorEntry(authorFile, { targets: ["main.result"] });
  const projection = compiled.author.exports.find((output) => output.name === "projection.result")?.ref;
  assert(projection?.kind === "logical-output");
  const prepared = buildCompiler.prepareExecutionView(compiled, [projection.id]);

  assert.equal(prepared.definition.plan.steps.length, 2);
  assert.deepEqual(prepared.targets.map((target) => target.name), ["main.result"]);
  assert.deepEqual(prepared.publication.outputs.map((output) => output.name), ["main.result"]);
  assert.equal(prepared.outputs.some((output) => output.output === projection.id), true);
  assert.throws(() => buildCompiler.prepareExecutionView(compiled, ["missing"]),
    /unknown logical output missing/u);
});

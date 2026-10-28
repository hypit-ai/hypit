import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { InvocationCompiler } from "@hypit/compiler";
import { InvocationFrontendRegistry } from "@hypit/invocation";
import { invocationMarkupFrontend } from "@hypit/markup/invocation";
import { compiler } from "../compiler-scenario.js";

test("an Author Source and explicit Invocation compile without a saved preset", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-direct-invocation-"));
  const authorFile = join(root, "main.svml");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup@1\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab@1\"/>",
    "  <lab:Result id=\"hello\"/>",
    "</svml>",
  ].join("\n"), "utf8");

  const invocationCompiler = new InvocationCompiler({
    authorCompiler: compiler(root),
    frontends: new InvocationFrontendRegistry(),
  });
  const compiled = await invocationCompiler.compileAuthorEntry(authorFile, {
    targets: ["hello.result"],
    overrides: [],
  });
  const prepared = invocationCompiler.prepareCompilation(compiled);

  assert.equal(compiled.preset, undefined);
  assert.equal(compiled.authorSource, await realpath(authorFile));
  assert.equal(compiled.invocation.targets.length, 1);
  assert.equal(prepared.definition.plan.steps.length, 1);
  assert.equal(prepared.publication.outputs[0]?.target, true);
});

test("authored realization selects an existing Record without executing the primary", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-authored-realization-"));
  const authorFile = join(root, "main.svml");
  const invocationFile = join(root, "build.svrun");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup@1\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab@1\"/>",
    "  <import as=\"realization\" from=\"@hypit/realization@1\"/>",
    "  <lab:Result id=\"hello\"/>",
    "  <lab:Accepted id=\"accepted\" value=\"kept\"/>",
    "  <realization:Select output={hello.result} record={accepted}/>",
    "</svml>",
  ].join("\n"), "utf8");
  await writeFile(invocationFile, [
    "<?svml using=\"@hypit/markup/invocation@1\"?>",
    "<svrun version=\"1\">",
    "  <author source=\"./main.svml\"/>",
    "  <target output=\"hello.result\"/>",
    "</svrun>",
  ].join("\n"), "utf8");

  const frontends = new InvocationFrontendRegistry();
  frontends.register(invocationMarkupFrontend);
  const invocationCompiler = new InvocationCompiler({
    authorCompiler: compiler(root),
    frontends,
  });
  const prepared = await invocationCompiler.preparePresetEntry(invocationFile);

  assert.equal(prepared.definition.plan.steps.length, 0);
  assert.equal(prepared.compilation.author.realizations.length, 1);
  const selected = prepared.selections.find((selection) =>
    selection.output === prepared.compilation.author.realizations[0]?.output);
  assert.equal(selected?.record, prepared.compilation.author.realizations[0]?.record);
  assert.equal(prepared.publication.outputs[0]?.record, prepared.compilation.author.realizations[0]?.record);
});

test("transient Invocation primary overrides an authored realization without exposing a Candidate id", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-realization-override-"));
  const authorFile = join(root, "main.svml");
  const invocationFile = join(root, "build.svrun");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup@1\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab@1\"/>",
    "  <import as=\"realization\" from=\"@hypit/realization@1\"/>",
    "  <lab:Result id=\"hello\"/>",
    "  <lab:Accepted id=\"accepted\" value=\"kept\"/>",
    "  <realization:Select output={hello.result} record={accepted}/>",
    "</svml>",
  ].join("\n"), "utf8");
  await writeFile(invocationFile, [
    "<?svml using=\"@hypit/markup/invocation@1\"?>",
    "<svrun version=\"1\">",
    "  <author source=\"./main.svml\"/>",
    "  <target output=\"hello.result\"/>",
    "  <override output=\"hello.result\" primary=\"true\"/>",
    "</svrun>",
  ].join("\n"), "utf8");

  const frontends = new InvocationFrontendRegistry();
  frontends.register(invocationMarkupFrontend);
  const invocationCompiler = new InvocationCompiler({
    authorCompiler: compiler(root),
    frontends,
  });
  const prepared = await invocationCompiler.preparePresetEntry(invocationFile);

  assert.equal(prepared.definition.plan.steps.length, 1);
  assert.equal(prepared.definition.plan.steps[0]?.producer.name, "produce");
  assert.notEqual(
    prepared.selections[0]?.record,
    prepared.compilation.author.realizations[0]?.record,
  );
});

test("transient Invocation Record override selects an existing Author value", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-invocation-record-"));
  const authorFile = join(root, "main.svml");
  const invocationFile = join(root, "build.svrun");
  await writeFile(authorFile, [
    "<?svml using=\"@hypit/markup@1\"?>",
    "<svml>",
    "  <import as=\"lab\" from=\"example.compiler-lab@1\"/>",
    "  <lab:Result id=\"hello\"/>",
    "  <lab:Accepted id=\"accepted\" value=\"kept\"/>",
    "</svml>",
  ].join("\n"), "utf8");
  await writeFile(invocationFile, [
    "<?svml using=\"@hypit/markup/invocation@1\"?>",
    "<svrun version=\"1\">",
    "  <author source=\"./main.svml\"/>",
    "  <target output=\"hello.result\"/>",
    "  <override output=\"hello.result\" record=\"accepted\"/>",
    "</svrun>",
  ].join("\n"), "utf8");

  const frontends = new InvocationFrontendRegistry();
  frontends.register(invocationMarkupFrontend);
  const invocationCompiler = new InvocationCompiler({
    authorCompiler: compiler(root),
    frontends,
  });
  const prepared = await invocationCompiler.preparePresetEntry(invocationFile);

  assert.equal(prepared.definition.plan.steps.length, 0);
  assert.equal(prepared.compilation.invocation.overrides[0]?.choice.kind, "record");
  assert.equal(prepared.selections[0]?.record, prepared.compilation.invocation.overrides[0]?.choice.kind === "record"
    ? prepared.compilation.invocation.overrides[0].choice.record
    : undefined);
});

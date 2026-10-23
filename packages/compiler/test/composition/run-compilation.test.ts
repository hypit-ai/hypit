import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RunCompiler } from "@hypit/compiler";
import { isBlobRef } from "@hypit/protocol";
import { RunFragmentRegistry, RunFrontendRegistry } from "@hypit/run";
import { runMarkupFrontend } from "@hypit/markup/run";
import { NodeFilesystemWorkspace } from "@hypit/workspace/node";

import {
  compiler,
  consumeFragment,
  consumeProducer,
  emptyManifest,
  laboratory,
  previewFragment,
  previewManifest,
  previewModule,
  previewProducer,
  resultType,
} from "../compiler-scenario.js";

test("Run-only Fragment modules extend the execution closure without polluting the Author Graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-dual-graph-closure-"));
  const unused = emptyManifest("example.unused-video-feature");
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "build.svrun");
  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <import as="unused" from="example.unused-video-feature@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <import from="@example/preview" as="preview"/>
    <target output="hello.result"/>
    <fragment id="one" using="preview:result"/>
    <satisfy output="hello.result" candidate="one.result"/>
  </svrun>`, "utf8");

  const authorCompiler = compiler(root, [previewManifest, unused]);
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const fragments = new RunFragmentRegistry();
  fragments.register({ name: "@example/preview", fragments: { result: previewFragment } });
  const runCompiler = new RunCompiler({ authorCompiler, frontends, fragments });
  const compiled = await runCompiler.compileEntry(runFile);
  const prepared = runCompiler.prepareCompilation(compiled);

  assert.deepEqual(
    compiled.author.program.closure.modules.map((item) => item.name),
    [laboratory.name, unused.name],
  );
  assert.deepEqual(
    compiled.program.closure.modules.map((item) => item.name).sort(),
    [laboratory.name, previewModule.name, unused.name].sort(),
  );
  assert.deepEqual(
    prepared.state.program.closure.modules.map((item) => item.name).sort(),
    [laboratory.name, previewModule.name].sort(),
    "the durable Build keeps only modules needed by its selected execution slice",
  );
  assert.deepEqual(prepared.definition.plan, prepared.state.plan);
  assert.deepEqual(prepared.definition.program, prepared.state.program);
  assert.equal(prepared.definition.plan.steps.length, 1);
  assert.equal(prepared.definition.plan.steps[0]?.producer.name, previewProducer.name);
});

test("static Run checking accepts a future Build Output source without opening project Results", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-future-build-record-"));
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "reuse.svrun");
  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <target output="hello.result"/>
    <build-record id="prior" build="future-build" output="hello.result"/>
    <satisfy output="hello.result" candidate="prior"/>
  </svrun>`, "utf8");
  const authorCompiler = compiler(root);
  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const runCompiler = new RunCompiler({
    authorCompiler,
    frontends,
    fragments: new RunFragmentRegistry(),
  });
  const workspace = await new NodeFilesystemWorkspace({ root }).open(runFile);
  const checked = await runCompiler.checkResolvedSource(workspace.entry, workspace);
  assert.deepEqual(checked.unresolvedHistoricalOutputs, [{
    id: "prior",
    build: "future-build",
    output: "hello.result",
  }]);
  await assert.rejects(
    runCompiler.compileResolvedSource(workspace.entry, workspace),
    /requires a project Result Store/u,
  );

  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="hello"/><lab:Result id="unused-history"/>
    <lab:Result id="unused-value"/><lab:Result id="unused-file"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <target output="hello.result"/>
    <build-record id="prior" build="future-build" output="unused-history.result"/>
    <value id="fixed" type="example.compiler-lab@1#Result" from="./missing-value.json"/>
    <file id="media" type="example.compiler-lab@1#Result" from="./missing-file.mp4" media-type="video/mp4"/>
    <satisfy output="unused-history.result" candidate="prior"/>
    <satisfy output="unused-value.result" candidate="fixed"/>
    <satisfy output="unused-file.result" candidate="media"/>
  </svrun>`, "utf8");
  const unusedWorkspace = await new NodeFilesystemWorkspace({ root }).open(runFile);
  const unusedChecked = await runCompiler.checkResolvedSource(unusedWorkspace.entry, unusedWorkspace);
  assert.deepEqual(unusedChecked.unresolvedHistoricalOutputs, [],
    "check reports external supply only from the selected execution");
  const compiled = await runCompiler.compileResolvedSource(unusedWorkspace.entry, unusedWorkspace);
  assert.equal(runCompiler.prepareCompilation(compiled).state.plan.steps.length, 1,
    "unreachable zero-input Candidates are never opened or substituted into the selected execution");

  await writeFile(join(root, "selected-value.json"), JSON.stringify(("ready")), "utf8");
  await writeFile(join(root, "selected-file.mp4"), new Uint8Array([1, 2, 3]));
  await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <target output="unused-value.result"/><target output="unused-file.result"/>
    <value id="fixed" type="example.compiler-lab@1#Result" from="./selected-value.json"/>
    <file id="media" type="example.compiler-lab@1#Result" from="./selected-file.mp4" media-type="video/mp4"/>
    <satisfy output="unused-value.result" candidate="fixed"/>
    <satisfy output="unused-file.result" candidate="media"/>
  </svrun>`, "utf8");
  const selectedWorkspace = await new NodeFilesystemWorkspace({ root }).open(runFile);
  const prepared = runCompiler.prepareCompilation(await runCompiler.compileResolvedSource(selectedWorkspace.entry, selectedWorkspace));
  assert.deepEqual(prepared.compilation.materializedSupplies.map((record) => isBlobRef(record.value) ? "blob" : "value").sort(), ["blob", "value"]);
});

test("a historical Output is materialized only when a selected Producer consumes it", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-consumed-build-record-"));
  const authorFile = join(root, "main.svml");
  const runFile = join(root, "reuse.svrun");
  await writeFile(authorFile, `<?svml using="@hypit/markup@1"?>
  <svml>
    <import as="lab" from="example.compiler-lab@1"/>
    <lab:Result id="source"/><lab:Result id="final"/>
  </svml>`, "utf8");
  await writeFile(runFile, `<?svml using="@hypit/markup/run@1"?>
  <svrun version="1">
    <author source="./main.svml"/>
    <import from="@example/preview" as="preview"/>
    <target output="final.result"/>
    <build-record id="prior" build="old-build" output="source.result"/>
    <fragment id="consumer" using="preview:consume"><input name="source" from="source.result"/></fragment>
    <satisfy output="source.result" candidate="prior"/>
    <satisfy output="final.result" candidate="consumer.result"/>
  </svrun>`, "utf8");

  const frontends = new RunFrontendRegistry();
  frontends.register(runMarkupFrontend);
  const fragments = new RunFragmentRegistry();
  fragments.register({
    name: "@example/preview",
    fragments: { result: previewFragment, consume: consumeFragment },
  });
  let located = 0;
  let resolved = 0;
  const runCompiler = new RunCompiler({
    authorCompiler: compiler(root, [previewManifest]),
    frontends,
    fragments,
    locateHistoricalOutput(build, output) {
      located += 1;
      assert.equal(build, "old-build");
      assert.equal(output, "source.result");
      return { build: "value-owner", output: "original.result", type: resultType };
    },
    resolveHistoricalOutput(build, output) {
      resolved += 1;
      assert.equal(build, "old-build");
      assert.equal(output, "source.result");
      return { type: resultType, value: ("historical") };
    },
  });

  const prepared = await runCompiler.prepareEntry(runFile);
  assert.equal(located, 1, "the selected historical address is validated from its manifest");
  assert.equal(resolved, 1, "a Producer dependency materializes the historical value exactly once");
  assert.equal(prepared.state.plan.steps.length, 1);
  assert.equal(prepared.state.plan.steps[0]?.producer.name, consumeProducer.name);
  assert.deepEqual(prepared.compilation.materializedSupplies.map((record) => record.value), [("historical")]);
  const forwarded = prepared.publication.outputs.find((output) => output.name === "source.result");
  assert(forwarded !== undefined);
  assert.equal(forwarded.name, "source.result");
  assert.equal(forwarded.target, false);
  assert.deepEqual(forwarded.type, resultType);
  assert.deepEqual(forwarded.source, {
    kind: "historical-output",
    build: "value-owner",
    output: "original.result",
  });
});

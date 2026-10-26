import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVideoDistribution } from "@hypit/video";
import { loadStudioDomain } from "../src/domain.js";
import { loadStudioCompanionRegistry } from "../src/companion-assembly.js";
import { loadStudioRun } from "../src/run.js";
import { executeStudioProjection, MemoryResourceStore } from "../src/execute.js";
import { observedTemporalValues, resolveStudioDeclarations } from "../src/temporal-declarations.js";
import { Executor } from "@hypit/hypit/executor";
import { InProcessBuildScheduler } from "@hypit/hypit/runtime";
import { readStudioSession } from "../src/session.js";

async function fixture(t: TestContext, extra = "", target = "program.timeline") {
  const root = await mkdtemp(join(tmpdir(), "hypit-studio-unused-time-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "main.svml"), `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="time" from="@hypit/timeline-author@1"/>
  <import as="media" from="@hypit/media@1"/>
  <import as="mediaop" from="@hypit/media-operations@1"/>
  <import as="space" from="@hypit/spatial@1"/>
  <import as="visual" from="@hypit/visual-track@1"/>
  <import as="film" from="@hypit/film@1"/>
  <import as="look" source="./look.svs"/>
  <time:Clock id="clock" frame-rate="30"/>
  <time:Timeline id="program" clock={clock} end="3s">
    <time:Instant id="unused" at="1s"/>
  </time:Timeline>
  <time:Instant id="standalone" timeline={program.timeline} at="2s"/>
  <time:Instant id="offset" timeline={program.timeline} at={standalone} offset="+5f"/>
  ${extra}
</svml>`);
  await writeFile(join(root, "source.mp4"), "A probe must require the Runtime; this fixture is never decoded.");
  await writeFile(join(root, "pixel.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ZkAAAAASUVORK5CYII=", "base64"));
  await writeFile(join(root, "look.svs"), '<?svml using="@hypit/recipe@1"?><sheet version="1">film.main { background: #000000; }</sheet>');
  const runPath = join(root, "main.svrun");
  await writeFile(runPath, `<?svml using="@hypit/markup/run@1"?>
<svrun version="1"><author source="./main.svml"/><target output="${target}"/></svrun>`);
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot: root,
    packageRoot: process.cwd(), distribution: createVideoDistribution() });
  const registry = await loadStudioCompanionRegistry({ distributionPackageRoot: process.cwd(), sourcePackages: domain.packages });
  const run = await loadStudioRun({ run: runPath, domain, registry });
  const unused = run.source.exports.find(output => output.name === "program.unused");
  assert.ok(unused);
  const resources = new MemoryResourceStore();
  const prepared = run.prepare(run.run, run.targets);
  const selected = await executeStudioProjection(domain, prepared.state, resources);
  assert.deepEqual(selected.errors, []);
  assert.equal(observedTemporalValues(selected.state, prepared.selections).some(value => value.id === unused.ref), false);
  return { root, run, domain, registry, resources, resolved: selected.state, selections: prepared.selections, unused };
}

test("Companion display requests resolve unused nested and standalone Instants", async (t) => {
  const input = await fixture(t);
  const declarations = await resolveStudioDeclarations({ ...input, transientExecution: {
    async evaluate(execution) {
      const timeline = input.selections.find(selection => selection.output === input.run.targets[0])!;
      const original = input.resolved.records.find(record => record.id === timeline.record)!;
      assert.ok([...execution.state.program.records, ...execution.state.records].some(record =>
        record.id.startsWith("studio:resolved:") && JSON.stringify(record.value) === JSON.stringify(original.value)),
        "the already resolved logical Timeline output is supplied as a value Candidate");
      return (await new InProcessBuildScheduler(new Executor(execution)).run([{
        id: "studio-test",
        definition: {
          format: "hypit.build-definition@1",
          program: execution.state.program,
          plan: execution.state.plan,
        },
        facts: [],
      }]))[0]!;
    },
    close() {},
  } });
  assert.deepEqual(declarations.issues, []);
  for (const [name, frame] of [["program.unused", 30], ["standalone", 60], ["offset", 65]] as const) {
    const output = input.run.source.exports.find(output => output.name === name)!;
    assert.equal((declarations.values.find(value => value.id === output.ref)?.value as { frame: number }).frame, frame);
  }
  assert.equal(input.resolved.status, "complete");
  assert.deepEqual(input.run.run.graph.satisfactions, [], "display reuse never changes the authored Run");
});

test("an unresolved locator upstream does not prevent other locators or the selected view", async (t) => {
  const input = await fixture(t, `
  <media:Video id="source" src="./source.mp4"/>
  <mediaop:Prepare id="prepared" source={source}
    video="primary-moving" audio="none" span-authority="video"/>
  <time:Timeline id="other" clock={clock} end="clip.end">
    <time:Window id="clip" from="start" for={prepared.extent}/>
    <time:Instant id="pending" at="clip.end"/>
  </time:Timeline>`);
  const declarations = await resolveStudioDeclarations(input);
  assert.ok(declarations.values.some(value => value.id === input.unused.ref));
  assert.ok(declarations.issues.some(issue => issue.includes("Unavailable display capability:")));
  assert.equal(input.resolved.status, "complete");
  assert.deepEqual(input.resolved.outstanding, []);
});

test("an invalid optional locator reports its failure without invalidating the selected view", async (t) => {
  const input = await fixture(t, '<time:Instant id="outside" timeline={program.timeline} at="10s"/>');
  const declarations = await resolveStudioDeclarations(input);
  assert.ok(declarations.issues.length > 0);
  assert.equal(input.resolved.status, "complete");
});

test("the complete Studio session displays an unconsumed Instant alongside a playable Film", async (t) => {
  const input = await fixture(t, `
  <space:Canvas id="canvas" width="64" height="64"/>
  <space:Extent id="extent" width="1" height="1"/>
  <media:Image id="picture" src="./pixel.png"/>
  <visual:Track id="track" timeline={program.timeline}>
    <visual:Clip id="still" image={picture} extent={extent}
      during={program.window} frame={canvas.bounds}/>
  </visual:Track>
  <film:Film id="film" canvas={canvas.canvas} timeline={program.timeline} appearance={look.film.main}>
    <film:Track id="track" source={track.visual}/>
  </film:Film>`, "film.composition");
  const session = await readStudioSession({ ...input, revision: 1, workspaceRoot: input.root });
  assert.deepEqual(session.declarationIssues, []);
  const locators = session.snapshot.temporalDomains.find(domain => domain.id === "absolute-declarations")!;
  assert.deepEqual(locators.items.map(item => item.label).sort(), ["offset", "standalone", "unused"]);
  assert.equal(session.snapshot.timeline.frameCount, 90);
  assert.equal(session.snapshot.tracks.length, 1);
  assert.deepEqual(session.snapshot.tracks[0]?.items[0]?.terminalTargets, [{
    kind: "visual-present",
    occurrencePath: ["track"],
    presentId: "still",
    elementId: "still:frame",
  }]);
  assert.ok(session.visualHtml.includes("<!doctype html>"));
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileSource, estimateSource } from "../src/compiler.js";
import { projectCanvas, projectTimeline } from "../src/views.js";

type Reference = {
  clock: { fps: number; durationFrames: number };
  plan: { root: string; values: number; instances: number; edges: number };
  selectionFrames: Record<string, Array<[number, number]>>;
  locatedOutput: { visualFragments: number; audioFragments: number };
};

const example = fileURLToPath(new URL("../examples/regen-ranking/", import.meta.url));

test("regen ranking compiles to the frozen production timing contract", async () => {
  const reference = JSON.parse(
    await readFile(new URL("../examples/regen-ranking/reference.json", import.meta.url), "utf8"),
  ) as Reference;
  const compilation = await compileSource({
    file: `${example}/regen-ranking.svml`,
  });

  assert.equal(compilation.located.fps, reference.clock.fps);
  assert.equal(compilation.located.durationFrames, reference.clock.durationFrames);
  assert.deepEqual(
    {
      root: compilation.plan.root,
      values: compilation.plan.values.length,
      instances: compilation.plan.instances.length,
      edges: compilation.plan.edges.length,
    },
    reference.plan,
  );

  for (const [id, expected] of Object.entries(reference.selectionFrames)) {
    assert.deepEqual(
      compilation.located.selections[id]?.ranges.map(
        (range) => [range.startFrame, range.endFrameExclusive],
      ),
      expected,
      id,
    );
  }

  const document = compilation.projections.get(compilation.plan.root)?.outputs.document as {
    visuals?: unknown[];
    audios?: unknown[];
  };
  assert.equal(document.visuals?.length, reference.locatedOutput.visualFragments);
  assert.equal(document.audios?.length, reference.locatedOutput.audioFragments);
  assert.match(compilation.html, /data-composition-id="regen-ranking"/u);
  assert.match(compilation.html, /data-duration="36\.1"/u);

  const canvas = projectCanvas(compilation.plan);
  assert.equal(canvas.root, reference.plan.root);
  assert.equal(canvas.nodes.length, reference.plan.values + reference.plan.instances);
  assert.equal(canvas.edges.length, reference.plan.edges);
  const brollContract = compilation.plan.kernels.find(
    (kernel) => kernel.name === "broll-track",
  );
  assert.deepEqual(
    brollContract?.children.map((child) => child.name),
    ["item", "transition"],
  );

  const timeline = projectTimeline(compilation);
  assert.equal(timeline.durationFrames, reference.clock.durationFrames);
  assert.equal(timeline.visuals.length, reference.locatedOutput.visualFragments);
  assert.equal(timeline.audios.length, reference.locatedOutput.audioFragments);

  const estimate = await estimateSource(`${example}/regen-ranking.svml`);
  assert.ok(Math.abs(estimate.evidence.durationSec - reference.clock.durationFrames / 30) < 0.5);
});

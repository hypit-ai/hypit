import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileSource } from "../src/compiler.js";
import type { VisualFragment } from "../src/runtime-contract.js";

test("Present ranges intersect the Item, overlap by layer, and keep one source-time map", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/presentation/", import.meta.url));
  const compilation = await compileSource({
    file: `${fixture}/main.svml`,
    evidenceFile: `${fixture}/alignment.json`,
  });
  const visuals = compilation.projections.get("aroll")?.visuals ?? [];
  assert.equal(visuals.length, 3);
  assert.deepEqual(
    visuals.map((fragment) => [
      fragment.startFrame,
      fragment.endFrameExclusive,
      fragment.layer,
      fragment.mediaStartSec,
    ]),
    [
      [60, 90, 0, 2],
      [0, 36, 10, 0],
      [30, 60, 20, 1],
    ],
  );
  assert.equal(visuals[1]?.style?.["border-radius"], "50%");
  assert.match(visuals[2]?.css ?? "", /@keyframes svml-present/u);
  const sfx = compilation.projections.get("sfx")?.audios ?? [];
  assert.deepEqual(
    sfx.map((fragment) => [
      fragment.startFrame,
      fragment.endFrameExclusive,
      fragment.bus,
    ]),
    [[33, 39, "sfx"]],
  );
});

test("B-roll crossfade extends only the visual surfaces and leaves source audio independent", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/collision/", import.meta.url));
  const compilation = await compileSource({
    file: `${fixture}/main.svml`,
    evidenceFile: `${fixture}/alignment.json`,
  });
  const broll = compilation.projections.get("broll");
  const visuals = (broll?.visuals ?? []) as VisualFragment[];
  const left = visuals.find((fragment) => fragment.id.includes(":left:"));
  const right = visuals.find((fragment) => fragment.id.includes(":right:"));
  assert.equal(left?.endFrameExclusive, 36);
  assert.equal(right?.startFrame, 30);
  assert.match(left?.css ?? "", /svml-broll-transition/u);
  assert.match(right?.css ?? "", /svml-broll-transition/u);
  assert.equal(broll?.audios?.length ?? 0, 0);
});

test("temporal one/each cardinality is declared by the Kernel contract", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/disconnected/", import.meta.url));
  const each = await compileSource({
    file: `${fixture}/each.svml`,
    evidenceFile: `${fixture}/alignment.json`,
  });
  assert.equal(each.projections.get("media")?.visuals?.length, 2);
  const media = each.plan.kernels.find((kernel) => kernel.name === "media-track");
  assert.equal(media?.children[0]?.fields.find((field) => field.name === "during")?.consume, "each");

  const set = await compileSource({
    file: `${fixture}/set.svml`,
    evidenceFile: `${fixture}/alignment.json`,
  });
  assert.deepEqual(set.projections.get("styles")?.diagnostics, [{
    code: "selection_set_count",
    message: "2",
  }]);

  await assert.rejects(
    compileSource({
      file: `${fixture}/one.svml`,
      evidenceFile: `${fixture}/alignment.json`,
    }),
    /temporal cardinality expected one, received 2/u,
  );
});

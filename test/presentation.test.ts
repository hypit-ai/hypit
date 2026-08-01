import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileSource } from "../src/compiler.js";
import type { VisualFragment } from "../src/runtime-contract.js";

test("Present ranges intersect the Item, overlap by absolute z, and keep one source-time map", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/presentation/", import.meta.url));
  const compilation = await compileSource({
    file: `${fixture}/main.svml`,
  });
  const visuals = compilation.projections.get("aroll")?.visuals ?? [];
  assert.equal(visuals.length, 3);
  assert.deepEqual(
    visuals.map((fragment) => [
      fragment.startFrame,
      fragment.endFrameExclusive,
      fragment.z,
      fragment.mediaStartSec,
    ]),
    [
      [60, 90, 200, 2],
      [0, 36, 210, 0],
      [30, 60, 220, 1],
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

test("a Present with no parent intersection fails instead of disappearing", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/presentation/", import.meta.url));
  await assert.rejects(
    compileSource({ file: `${fixture}/empty-present.svml` }),
    /presentation_empty/u,
  );
});

test("B-roll crossfade extends only the visual surfaces and leaves source audio independent", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/collision/", import.meta.url));
  const compilation = await compileSource({
    file: `${fixture}/main.svml`,
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
  });
  assert.equal(each.projections.get("media")?.visuals?.length, 2);
  const media = each.plan.kernels.find((kernel) => kernel.name === "media-track");
  assert.equal(media?.children[0]?.fields.find((field) => field.name === "during")?.consume, "each");

  const set = await compileSource({
    file: `${fixture}/set.svml`,
  });
  assert.deepEqual(set.projections.get("styles")?.diagnostics, [{
    code: "selection_set_count",
    message: "2",
  }]);

  await assert.rejects(
    compileSource({
      file: `${fixture}/one.svml`,
    }),
    /temporal cardinality expected one, received 2/u,
  );
});

test("disconnected SelectionSet drives one caption style rule without losing occurrences", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/disconnected/", import.meta.url));
  const compilation = await compileSource({ file: `${fixture}/captions.svml` });
  const captions = compilation.projections.get("captions")?.visuals ?? [];
  assert.ok(captions.length > 0);
  assert.ok(captions.some((fragment) => /color:#ff0000/u.test(fragment.html ?? "")));
  assert.ok(captions.some((fragment) => /color:#00ff00/u.test(fragment.html ?? "")));
  assert.ok(captions.some((fragment) => /scale\(1\.1\)/u.test(fragment.html ?? "")));
  assert.ok(captions.some((fragment) => /background:#0000ff/u.test(fragment.html ?? "")));
  assert.ok(captions.every((fragment) => !/gap/u.test(fragment.html ?? "")));
  const plan = compilation.projections.get("caption-plan")?.outputs.plan as {
    annotations?: Array<{ kind: string }>;
  };
  assert.deepEqual(plan.annotations?.map((annotation) => annotation.kind), ["accent", "accent"]);
});

test("a Composition rejects a second CaptionTrack but permits no CaptionTrack", async () => {
  const fixture = fileURLToPath(new URL("./fixtures/disconnected/", import.meta.url));
  await assert.rejects(
    compileSource({ file: `${fixture}/duplicate-captions.svml` }),
    /caption_track_cardinality/u,
  );
});

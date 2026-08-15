import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/core";
import { MemoryBuildCatalog } from "@narratage/runtime";

function descriptor(core = digestOf("core:one")) {
  return {
    format: "narratage.build-catalog-descriptor@1" as const,
    core,
    source: { path: "/project/main.svml", closure: digestOf("source:one") },
    run: { path: "/project/delivery.svrun" },
    aliases: [{
      name: "final.video",
      ref: { kind: "logical-output" as const, id: "logical:final" },
    }],
  };
}

test("Build Catalog freezes the first Host presentation for a Build id", async () => {
  let now = 100;
  const catalog = new MemoryBuildCatalog(() => now);
  const first = await catalog.record("delivery-01", descriptor());
  assert.equal(first.createdAt, 100);
  assert.equal(first.aliases[0]?.name, "final.video");

  now = 200;
  const repeated = await catalog.record("delivery-01", descriptor());
  assert.equal(repeated.createdAt, 100);
  assert.equal(repeated.updatedAt, 100);
  await assert.rejects(catalog.record("delivery-01", {
    ...descriptor(), aliases: [{ ...descriptor().aliases[0]!, name: "renamed.video" }],
  }), /another source, Run Source or output naming/u);
  assert.deepEqual((await catalog.list()).map((item) => item.build), ["delivery-01"]);

  (repeated as unknown as { aliases: { name: string }[] }).aliases[0]!.name = "tampered";
  assert.equal((await catalog.read("delivery-01"))?.aliases[0]?.name, "final.video");
});

test("Build Catalog cannot retarget one Build id to another Core Build", async () => {
  const catalog = new MemoryBuildCatalog(() => 100);
  await catalog.record("delivery-01", descriptor());
  await assert.rejects(
    catalog.record("delivery-01", descriptor(digestOf("core:two"))),
    /another source, Run Source or output naming/u,
  );
});

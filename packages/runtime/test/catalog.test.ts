import assert from "node:assert/strict";
import test from "node:test";
import { MemoryBuildCatalog } from "@narratage/runtime";

function descriptor() {
  return {
    format: "narratage.build-catalog-descriptor@1" as const,
    source: { path: "/project/main.svml" },
    run: { path: "/project/delivery.svrun" },
    aliases: [{
      name: "final.video",
      ref: { kind: "logical-output" as const, id: "logical:final" },
    }],
  };
}

test("Build Catalog records Host presentation for history and output lookup", async () => {
  const catalog = new MemoryBuildCatalog(() => 100);
  const first = await catalog.record("delivery-01", descriptor());
  assert.equal(first.createdAt, 100);
  assert.equal(first.aliases[0]?.name, "final.video");
  assert.deepEqual((await catalog.list()).map((item) => item.build), ["delivery-01"]);
  assert.equal((await catalog.read("delivery-01"))?.source.path, "/project/main.svml");
});

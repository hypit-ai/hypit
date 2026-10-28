import assert from "node:assert/strict";
import test from "node:test";

import { sealSeedreamRequest } from "../src/index.js";

const references = (count: number) => Array.from({ length: count }, (_, index) => ({
  role: "image" as const,
  artifact: { kind: "blob" as const, resource: `res_seedream_${index}` as `res_${string}`, size: 1, mediaType: "image/png" },
}));

test("Seedream owns its fourteen-reference model limit", () => {
  const base = {
    prompt: ["compose"], aspectRatio: ["1:1"], quality: ["basic"], outputFormat: ["png"], nsfwCheck: [true],
  } as const;
  assert.equal(sealSeedreamRequest({ ...base, images: references(14) }).fields.images?.length, 14);
  assert.throws(() => sealSeedreamRequest({ ...base, images: references(15) }), /at most 14/u);
});

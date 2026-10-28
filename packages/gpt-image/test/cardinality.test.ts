import assert from "node:assert/strict";
import test from "node:test";

import { sealGptImage2Request } from "../src/index.js";

const references = (count: number) => Array.from({ length: count }, (_, index) => ({
  role: "image" as const,
  artifact: { kind: "blob" as const, resource: `res_gpt_${index}` as `res_${string}`, size: 1, mediaType: "image/png" },
}));

test("GPT Image owns its sixteen-reference model limit", () => {
  const base = { prompt: ["compose"], aspectRatio: ["1:1"], resolution: ["1K"] } as const;
  assert.equal(sealGptImage2Request({ ...base, images: references(16) }).fields.images?.length, 16);
  assert.throws(() => sealGptImage2Request({ ...base, images: references(17) }), /at most 16/u);
});

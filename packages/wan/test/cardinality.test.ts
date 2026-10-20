import assert from "node:assert/strict";
import test from "node:test";

import { sealWanRequest } from "../src/index.js";

const references = (count: number) => Array.from({ length: count }, (_, index) => ({
  role: "image" as const,
  artifact: { kind: "blob" as const, resource: `res_wan_${index}` as `res_${string}`, size: 1, mediaType: "image/png" },
}));

test("Wan owns its reference and image-set ceiling limits", () => {
  const base = { prompt: ["compose"] } as const;
  assert.equal(sealWanRequest("wan-2.7-image", { ...base, images: references(9), count: [12], imageSet: [true] })
    .ports.images?.length, 9);
  assert.throws(() => sealWanRequest("wan-2.7-image", { ...base, images: references(10) }), /at most 9/u);
  assert.throws(() => sealWanRequest("wan-2.7-image", { ...base, count: [13], imageSet: [true] }), /at most 12/u);
});

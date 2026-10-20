import assert from "node:assert/strict";
import test from "node:test";

import { sealGrokImagineRequest } from "../src/index.js";

const references = (count: number) => Array.from({ length: count }, (_, index) => ({
  role: "image" as const,
  artifact: { kind: "blob" as const, resource: `res_grok_${index}` as `res_${string}`, size: 1, mediaType: "image/png" },
}));

test("each Grok contract owns its seven-reference model limit", () => {
  for (const model of ["grok-imagine-video", "grok-imagine-video-1.5-preview"] as const) {
    const base = {
      prompt: ["animate"], aspectRatio: [model === "grok-imagine-video" ? "16:9" : "auto"],
      resolution: ["720p"], duration: [6],
    } as const;
    assert.equal(sealGrokImagineRequest(model, { ...base, images: references(7) }).ports.images?.length, 7);
    assert.throws(() => sealGrokImagineRequest(model, { ...base, images: references(8) }), /at most 7/u);
  }
});

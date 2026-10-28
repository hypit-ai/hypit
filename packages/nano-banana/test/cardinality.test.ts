import assert from "node:assert/strict";
import test from "node:test";

import { sealNanoBananaRequest } from "../src/index.js";

const references = (count: number) => Array.from({ length: count }, (_, index) => ({
  role: "image" as const,
  artifact: { kind: "blob" as const, resource: `res_nano_${index}` as `res_${string}`, size: 1, mediaType: "image/png" },
}));

test("Nano Banana variants retain their distinct model-owned reference limits", () => {
  for (const [model, maximum] of [["nano-banana-2", 14], ["nano-banana-pro", 8]] as const) {
    const base = { prompt: ["compose"], aspectRatio: ["1:1"], resolution: ["1K"], outputFormat: ["png"] } as const;
    assert.equal(sealNanoBananaRequest(model, { ...base, images: references(maximum) }).fields.images?.length, maximum);
    assert.throws(() => sealNanoBananaRequest(model, { ...base, images: references(maximum + 1) }),
      new RegExp(`at most ${maximum}`, "u"));
  }
});
